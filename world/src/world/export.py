"""SQL -> world/out/events_*.json: amit a pipeline a világból látott.

    uv run python -m world.export            # a teljes világ; három fájlt ír
    uv run python -m world.export --days 30  # próbafutás: ellenőriz, de NEM ír
    uv run python -m world.export --emitted  # a negyedik fájl; adatbázis nem kell

Három fájl az adatbázisból, fájlonként egy függvény:
  events_ledger.json — a veszteség-főkönyv: mi indult el, mi ért célba
  events_daily.json  — napi session, rendelés, bevétel csatornánként
  events_sample.json — két teljes journey az inspektornak
Egy az emit újrafuttatásából és a már megírt mintaszeletből (--emitted):
  events_emitted.json — amit az emit a minta journey-ihez legyártott

A főkönyv emit-oldala az emit újrafuttatásából jön, a pipeline-oldala a DB-ből.
A kettő összevetése a check(): ha bármi nem stimmel, a modul NEM ÍR FÁJLT —
így a lapra csak olyan szám kerülhet, ami végigment a pipeline-on (4. szabály).
A világ igazság-fájlját ez a modul nem olvassa: itt nincs modell, nincs mit
összevetni vele (1. szabály).
"""
import argparse
import json
import os
from datetime import date, datetime
from decimal import Decimal
from itertools import groupby
from pathlib import Path
from typing import Iterable
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from .config import ALL_SLUGS, EMIT, WORLD, WorldConfig
from .dgp import run
from .emit import SOURCE_MEDIUM, events, plan, summary
from .load import config_for
from .local import require_local

DB_URL = os.environ.get(
    "WORLD_DB_URL", "postgresql://fpworld:fpworld_local@127.0.0.1:15433/fpworld"
)
OUT = Path(__file__).resolve().parents[2] / "out"
SAMPLE_MAX_EVENTS = 60

# A session forrása az ELSŐ eseményének forrása (a többin nincs forrásjel),
# a napja pedig az első eseményének napja — ahogy a DGP is számolja. Egy éjfélt
# átlépő session rendelése ezért a session kezdőnapjára kerül.
FIRST_EVENT = """
    SELECT DISTINCT ON (session_id)
           session_id, source_medium, (occurred_at AT TIME ZONE 'UTC')::date AS nap
    FROM clean_events
    ORDER BY session_id, occurred_at, id
"""


def pipeline_counts(conn) -> dict:
    sor = conn.execute("""
        SELECT
          (SELECT COUNT(*) FROM raw_events) AS raw_events,
          (SELECT COUNT(*) FROM raw_events
            WHERE processed_at IS NULL AND processing_error IS NULL) AS unprocessed,
          (SELECT COUNT(*) FROM raw_events WHERE processing_error IS NOT NULL) AS failed,
          (SELECT COUNT(*) FROM clean_events) AS clean_events,
          (SELECT COUNT(DISTINCT session_id) FROM clean_events) AS sessions,
          (SELECT COUNT(DISTINCT anonymous_id) FROM clean_events) AS devices,
          (SELECT COUNT(DISTINCT person_id) FROM resolved_events) AS persons,
          (SELECT COUNT(*) FROM orders) AS orders,
          (SELECT COALESCE(SUM(value), 0) FROM orders) AS revenue_huf,
          (SELECT COUNT(*) FROM identity_links) AS identity_links,
          (SELECT COUNT(DISTINCT customer_key) FROM identity_links) AS customers_identified
    """).fetchone()
    return {k: int(v) for k, v in sor.items()}


def check(emit: dict, pipe: dict) -> list[str]:
    """A beépített ellenőrzések. Üres lista = minden stimmel."""
    hibak = []

    def egyezik(mi, pipeline_ertek, emit_ertek):
        if pipeline_ertek != emit_ertek:
            hibak.append(f"{mi}: a pipeline-ban {pipeline_ertek:,}, az emit szerint {emit_ertek:,}")

    egyezik("raw_events vs. elküldött egyedi esemény",
            pipe["raw_events"], emit["events_sent_unique"])
    if pipe["unprocessed"]:
        hibak.append(f"{pipe['unprocessed']:,} feldolgozatlan sor maradt a raw_events-ben")
    if pipe["failed"]:
        hibak.append(f"{pipe['failed']:,} sor processing_error-ral áll")
    egyezik("clean_events vs. raw_events", pipe["clean_events"], pipe["raw_events"])
    egyezik("session", pipe["sessions"], emit["sessions_consented"])
    egyezik("orders darab vs. consentet adott purchase", pipe["orders"], emit["orders_consented"])
    egyezik("orders érték vs. consentet adott purchase",
            pipe["revenue_huf"], emit["revenue_consented_huf"])
    return hibak


def build_ledger(emit: dict, pipe: dict) -> dict:
    return {
        "schema_version": 1,
        "events": {
            "generated": emit["events_generated"],
            "withheld_no_consent": emit["events_withheld_no_consent"],
            "sent_unique": emit["events_sent_unique"],
            "sent_duplicate": emit["events_sent_duplicate"],
            "raw_events": pipe["raw_events"],
            "clean_events": pipe["clean_events"],
        },
        "sessions": {"dgp": emit["sessions"], "pipeline": pipe["sessions"]},
        "orders": {"dgp": emit["orders"], "pipeline": pipe["orders"]},
        "revenue_huf": {"dgp": emit["revenue_huf"], "pipeline": pipe["revenue_huf"]},
        "identity": {
            "customers_dgp": emit["customers"],
            "customers_consented_dgp": emit["customers_consented"],
            "devices_dgp": emit["devices"],
            "devices_pipeline": pipe["devices"],
            "identity_links": pipe["identity_links"],
            "customers_identified": pipe["customers_identified"],
            "persons_after_stitching": pipe["persons"],
        },
    }


def daily_grid(cfg: WorldConfig, session_sorok: list[dict], rendeles_sorok: list[dict]) -> dict:
    """(nap, source_medium) sorokból csatornánkénti napi tömbök, ALL_SLUGS sorrendben."""
    slug = {sm: s for s, sm in SOURCE_MEDIUM.items()}
    n = cfg.n_days
    racs = {k: {s: [0] * n for s in ALL_SLUGS} for k in ("sessions", "orders", "revenue_huf")}

    def hely(sor):
        if sor["source_medium"] not in slug:
            raise ValueError(f"ismeretlen source_medium a pipeline-ban: {sor['source_medium']!r}")
        i = (sor["nap"] - cfg.start).days
        if not 0 <= i < n:
            raise ValueError(f"a világ időszakán kívüli nap a pipeline-ban: {sor['nap']}")
        return slug[sor["source_medium"]], i

    for sor in session_sorok:
        s, i = hely(sor)
        racs["sessions"][s][i] = int(sor["sessions"])
    for sor in rendeles_sorok:
        s, i = hely(sor)
        racs["orders"][s][i] = int(sor["orders"])
        racs["revenue_huf"][s][i] = int(sor["revenue_huf"])

    return {
        "schema_version": 1,
        "start": cfg.start.isoformat(),
        "channels": list(ALL_SLUGS),
        **{k: [racs[k][s] for s in ALL_SLUGS] for k in racs},
    }


def build_daily(conn, cfg: WorldConfig) -> dict:
    sessionok = conn.execute(f"""
        WITH elso AS ({FIRST_EVENT})
        SELECT nap, source_medium, COUNT(*) AS sessions FROM elso GROUP BY 1, 2
    """).fetchall()
    rendelesek = conn.execute(f"""
        WITH elso AS ({FIRST_EVENT})
        SELECT e.nap, e.source_medium, COUNT(*) AS orders, SUM(o.value) AS revenue_huf
        FROM orders o JOIN elso e USING (session_id)
        GROUP BY 1, 2
    """).fetchall()
    return daily_grid(cfg, sessionok, rendelesek)


def _journey(conn, kind: str, session_ids: list[str]) -> dict:
    raw = conn.execute("""
        SELECT event_id, event_name, occurred_at, received_at, session_id, anonymous_id,
               page_url, referrer, utm_source, utm_medium, payload
        FROM raw_events WHERE session_id = ANY(%s) ORDER BY occurred_at, id
    """, (session_ids,)).fetchall()
    clean = conn.execute("""
        SELECT event_id, event_name, occurred_at, session_id, anonymous_id,
               source_medium, person_id
        FROM resolved_events WHERE session_id = ANY(%s) ORDER BY occurred_at, id
    """, (session_ids,)).fetchall()
    orders = conn.execute("""
        SELECT order_id, event_id, value, currency, customer_key, anonymous_id,
               session_id, occurred_at
        FROM orders WHERE session_id = ANY(%s) ORDER BY occurred_at
    """, (session_ids,)).fetchall()
    eszkozok = sorted({r["anonymous_id"] for r in raw})
    linkek = conn.execute("""
        SELECT anonymous_id, customer_key, first_seen_at
        FROM identity_links WHERE anonymous_id = ANY(%s) ORDER BY first_seen_at
    """, (eszkozok,)).fetchall()
    return {"kind": kind, "raw_events": raw, "clean_events": clean,
            "orders": orders, "identity_links": linkek}


def build_sample(conn) -> dict:
    """Két journey: egy két eszközről összefűzött vásárló, és egy névtelen látogató.

    A kiválasztás determinisztikus (a legkisebb kulcs, a legkorábbi esemény),
    hogy az újrafuttatott export ugyanazt a két journey-t adja.
    """
    vasarlo = conn.execute("""
        SELECT customer_key FROM identity_links
        GROUP BY 1 HAVING COUNT(*) >= 2 ORDER BY 1 LIMIT 1
    """).fetchone()
    if vasarlo is None:
        raise LookupError("nincs két eszközről azonosított vásárló az adatban")
    fuzott = [r["session_id"] for r in conn.execute("""
        SELECT DISTINCT ON (anonymous_id) session_id FROM orders
        WHERE customer_key = %s ORDER BY anonymous_id, occurred_at
    """, (vasarlo["customer_key"],)).fetchall()]

    nevtelen = conn.execute("""
        SELECT c.session_id FROM clean_events c
        WHERE c.event_name = 'add_to_cart'
          AND NOT EXISTS (SELECT 1 FROM identity_links l
                          WHERE l.anonymous_id = c.anonymous_id)
        ORDER BY c.occurred_at, c.session_id LIMIT 1
    """).fetchone()
    if nevtelen is None:
        raise LookupError("nincs névtelen, kosárig jutott session az adatban")

    journeyk = [
        _journey(conn, "stitched_two_devices", fuzott),
        _journey(conn, "anonymous", [nevtelen["session_id"]]),
    ]
    n = sum(len(j["raw_events"]) for j in journeyk)
    if n > SAMPLE_MAX_EVENTS:
        raise ValueError(f"a mintaszelet {n} esemény, a plafon {SAMPLE_MAX_EVENTS} (3. szabály)")
    return {"schema_version": 1, "journeys": journeyk}


EMITTED_MAX_EVENTS = 80
NO_CONSENT_MAX_EVENTS = 8


def _with_fate(esemenyek: list[dict]) -> list[dict]:
    """Minden esemény egyszer, a sorsával. A duplikátum az emit folyamában
    kétszer egymás után jön; itt egy sor lesz belőle, `sent_twice` sorssal."""
    ki: list[dict] = []
    for e in esemenyek:
        if ki and ki[-1]["event_id"] == e["event_id"]:
            ki[-1]["fate"] = "sent_twice"
            continue
        ki.append({**e, "fate": "sent" if e["consent_analytics"] else "withheld"})
    return ki


def build_emitted(stream: Iterable[dict], sample: dict) -> dict:
    """Az elküldött réteg az inspektornak: amit az emit a mintaszelet journey-ihez
    legyártott, és egy harmadik journey, amiből semmi nem indult el.

    `stream`: az emit.events() kimenete, session-sorrendben. `sample`: a már
    megírt events_sample.json tartalma — abból tudjuk, melyik sessionök kellenek.
    A consent nélküli journey az első olyan session, ami consent nélkül
    vásárlásig jutott: determinisztikus, mert az emit sorrendje az.
    """
    kind_of = {str(e["session_id"]): j["kind"]
               for j in sample["journeys"] for e in j["raw_events"]}
    talalt: dict[str, list[dict]] = {j["kind"]: [] for j in sample["journeys"]}
    hatra = set(kind_of)
    nincs_consent: list[dict] | None = None

    for session_id, csoport in groupby(stream, key=lambda e: e["session_id"]):
        if session_id in hatra:
            talalt[kind_of[session_id]].extend(csoport)
            hatra.discard(session_id)
        elif nincs_consent is None:
            sess = list(csoport)
            if (not sess[0]["consent_analytics"] and sess[-1]["event_name"] == "purchase"
                    and len(sess) <= NO_CONSENT_MAX_EVENTS):
                nincs_consent = sess
        if not hatra and nincs_consent is not None:
            break

    if hatra:
        raise LookupError(f"a mintaszelet {len(hatra)} sessionje nincs az emit folyamában: "
                          "a minta nem ebből a világból való")
    if nincs_consent is None:
        raise LookupError("nincs consent nélküli, vásárlásig jutott session az adatban")

    journeyk = [{"kind": kind, "emitted_events": _with_fate(sorted(es, key=lambda e: e["occurred_at"]))}
                for kind, es in talalt.items()]
    journeyk.append({"kind": "no_consent", "emitted_events": _with_fate(nincs_consent)})

    # Ami megérkezett, annak pontosan az elküldött eseményekkel kell egyeznie.
    for j, minta in zip(journeyk, sample["journeys"]):
        erkezett = {str(e["event_id"]) for e in minta["raw_events"]}
        kuldott = {e["event_id"] for e in j["emitted_events"] if e["fate"] != "withheld"}
        if erkezett != kuldott:
            raise ValueError(f'"{j["kind"]}": a raw_events {len(erkezett)} eseménye nem egyezik '
                             f"az emit szerint elküldött {len(kuldott)} eseménnyel")

    n = sum(len(j["emitted_events"]) for j in journeyk)
    if n > EMITTED_MAX_EVENTS:
        raise ValueError(f"az elküldött réteg {n} esemény, a plafon {EMITTED_MAX_EVENTS} (3. szabály)")
    return {"schema_version": 1, "journeys": journeyk}


def write_emitted() -> None:
    """Megírja az events_emitted.json-t. Adatbázis nem kell: az emit
    újrafuttatásából és a már megírt events_sample.json-ból dolgozik."""
    sample = json.loads((OUT / "events_sample.json").read_text(encoding="utf-8"))
    print("Az emit újrafuttatása a teljes világon (~1 perc)…")
    vilag = run(WORLD)
    emitted = build_emitted(events(vilag, WORLD, EMIT), sample)
    _write("events_emitted.json", emitted)


def _json_default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, UUID):
        return str(o)
    if isinstance(o, Decimal):
        return int(o) if o == o.to_integral_value() else float(o)
    raise TypeError(type(o))


def _write(nev: str, adat: dict) -> None:
    OUT.mkdir(exist_ok=True)
    (OUT / nev).write_text(
        json.dumps(adat, ensure_ascii=False, indent=1, default=_json_default),
        encoding="utf-8",
    )
    print(f"  {nev}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=None)
    ap.add_argument("--emitted", action="store_true",
                    help="csak az events_emitted.json-t írja; adatbázis nem kell")
    args = ap.parse_args()
    if args.emitted:
        write_emitted()
        return
    days = args.days
    proba = days is not None

    dsn = require_local(DB_URL)
    cfg = config_for(days)
    print(f"Az emit újrafuttatása ({cfg.n_days} nap)…")
    vilag = run(cfg)
    emit = summary(vilag, plan(vilag, cfg, EMIT))

    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        conn.read_only = True
        pipe = pipeline_counts(conn)
        hibak = check(emit, pipe)
        if hibak:
            raise SystemExit("NEM írok fájlt, mert a pipeline nem stimmel:\n  - "
                             + "\n  - ".join(hibak))
        ledger = build_ledger(emit, pipe)
        daily = build_daily(conn, cfg)
        try:
            sample = build_sample(conn)
        except LookupError as e:
            if not proba:
                raise
            sample = None
            print(f"  (próbafutás: nincs mintaszelet — {e})")

    print(json.dumps(ledger, ensure_ascii=False, indent=1))
    if proba:
        print("Próbafutás: minden ellenőrzés átment, fájlt NEM írtam.")
        return
    _write("events_ledger.json", ledger)
    _write("events_daily.json", daily)
    _write("events_sample.json", sample)
    print("kész.")


if __name__ == "__main__":
    main()

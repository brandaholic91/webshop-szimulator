"""Négy attribúciós modell a pipeline adatán, az igazsághoz mérve -> out/attribution.json.

    uv run python -m world.attribution

Futó helyi világ-instance kell hozzá (elég a `db` szolgáltatás). A session-szintű
adat nem áll meg fájlban: a futtató a DB-ből olvassa, és csak az eredményt írja ki.

A sorrend számít (1. szabály): előbb a négy modell fut le mind a négy ablakra
(estimate), és csak UTÁNA kerül melléjük az igazság (assemble). Az igazság-fájlt
továbbra is egyedül a compare modul olvassa.

A futtató NEM ÍR FÁJLT, ha a DB nem az, amiből a commitolt events-fájlok
készültek: a sessionök és a rendelések számát és összegét a főkönyvhöz méri.
"""
import json

import psycopg

from .compare import attribution_truth, compare_attribution
from .config import ALL_SLUGS, PAID_SLUGS
from .export import DB_URL, OUT
from .journeys import Session, build_paths, fetch_sessions
from .local import require_local
from .models.attribution import last_click, linear, markov, time_decay

WINDOWS = (7, 14, 30, 90)      # lookback-ablak napokban; a 30 a GA alapértéke
DEFAULT_WINDOW = 30
# A sorrend a DESIGN.md ordinális létrájának sorrendje.
MODELS = {"last_click": last_click, "linear": linear, "time_decay": time_decay, "markov": markov}


def check(sessions: list[Session], ledger: dict) -> list[str]:
    """Ugyanaz a DB-e, amiből az events_ledger.json készült? Üres lista = igen."""
    rendelesek = [s.value_huf for s in sessions if s.value_huf is not None]
    hibak = []

    def egyezik(mi, db, fokonyv):
        if db != fokonyv:
            hibak.append(f"{mi}: a DB-ben {db:,}, az events_ledger.json szerint {fokonyv:,}")

    egyezik("session", len(sessions), ledger["sessions"]["pipeline"])
    egyezik("rendelés darab", len(rendelesek), ledger["orders"]["pipeline"])
    egyezik("rendelés érték", sum(rendelesek), ledger["revenue_huf"]["pipeline"])
    return hibak


def estimate(sessions: list[Session]) -> dict[int, dict]:
    """Ablakonként az útvonalak száma és a négy modell kiosztott bevétele.
    Igazságot nem lát és nem is kap."""
    ki = {}
    for w in WINDOWS:
        utak = build_paths(sessions, w)
        konvertalo = sum(1 for u in utak if u.value_huf is not None)
        ki[w] = {
            "paths": {"converting": konvertalo, "non_converting": len(utak) - konvertalo},
            "revenue": {nev: modell(utak) for nev, modell in MODELS.items()},
        }
    return ki


def assemble(becslesek: dict[int, dict], ledger: dict, spend: dict, truth: dict) -> dict:
    """A kész becslések mellé teszi az igazságot: ez az attribution.json tartalma."""
    pipeline = ledger["revenue_huf"]["pipeline"]
    teljes = ledger["revenue_huf"]["dgp"]
    koltes = {s: sum(napi) for s, napi in zip(spend["channels"], spend["daily_huf"])}
    return {
        "schema_version": 1,
        "windows": list(WINDOWS),
        "default_window": DEFAULT_WINDOW,
        "channels": list(ALL_SLUGS),
        "paid": list(PAID_SLUGS),
        "models": list(MODELS),
        "total_revenue_huf": teljes,
        "pipeline_revenue_huf": pipeline,
        "truth": truth,
        "by_window": {
            str(w): {
                "paths": b["paths"],
                **compare_attribution(b["revenue"], pipeline, teljes, koltes, truth),
            }
            for w, b in becslesek.items()
        },
    }


def _read(nev: str) -> dict:
    return json.loads((OUT / nev).read_text(encoding="utf-8"))


def main() -> None:
    dsn = require_local(DB_URL)
    ledger = _read("events_ledger.json")
    spend = _read("world_spend.json")

    print("Sessionök beolvasása a helyi világ-DB-ből…")
    with psycopg.connect(dsn) as conn:
        conn.read_only = True
        sessions = fetch_sessions(conn)

    hibak = check(sessions, ledger)
    if hibak:
        raise SystemExit("NEM írok fájlt, mert a DB nem az, amiből az events-fájlok készültek:\n  - "
                         + "\n  - ".join(hibak))

    print(f"{len(sessions):,} session; a négy modell {len(WINDOWS)} ablakra…")
    becslesek = estimate(sessions)
    adat = assemble(becslesek, ledger, spend, attribution_truth())

    (OUT / "attribution.json").write_text(
        json.dumps(adat, ensure_ascii=False, indent=1), encoding="utf-8")
    for w in WINDOWS:
        hiba = adat["by_window"][str(w)]["mean_abs_error_pp"]
        print(f"  {w:>2} nap  " + "  ".join(f"{m} {hiba[m]:.2f}" for m in MODELS))
    print("  attribution.json\nkész.")


if __name__ == "__main__":
    main()

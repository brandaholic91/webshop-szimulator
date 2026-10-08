"""A világ sessionjeiből és rendeléseiből eseményeket gyárt, mérési zajjal.

A DGP session-szintű: tudja, ki melyik nap melyik csatornán jött, és vásárolt-e.
Ez a modul azt teszi hozzá, amit egy tracker látna belőle: oldalmegtekintéseket
másodpercre, eszközöket saját azonosítóval, és három zajforrást (33. döntés):

  eszközök   — egy vásárló 1 vagy 2 eszközről jön, mindegyik külön anonymous_id
  consent    — eszközönként dől el; aki nem ad, annak eseményei nem indulnak el
  duplikátum — az elküldött események egy része kétszer megy be

Két lépés. A plan() mindent tömbökben sorsol ki — ebből számol a summary(),
események legyártása nélkül. Az events() ebből a tervből állítja elő a tényleges
eseményeket, egyesével, lemezre írás nélkül (3. nem-tárgyalható szabály).

A vásárlást NEM ez a modul sorsolja: a DGP már eldöntötte. Saját RNG-rétege
van ("emit", a LAYERS végén), tehát a világ egyetlen meglévő száma sem mozdul.
"""
import uuid
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from typing import Iterator

import numpy as np

from .config import ALL_SLUGS, EmitConfig, WorldConfig
from .dgp import World
from .rng import streams

SITE = "https://bolt.example"
NAMESPACE = uuid.UUID("6f1c2a54-0d0b-4b7e-9a51-3f2a7c1e8d10")

# Csatorna -> amit a landing esemény kap. A session többi eseményén nincs
# forrásjel, ahogy a valódi tracker.js-nél sincs.
LANDING = {
    "google_ads": {"utm_source": "google", "utm_medium": "cpc"},
    "meta_ads": {"utm_source": "facebook", "utm_medium": "cpc"},
    "arukereso": {"utm_source": "arukereso", "utm_medium": "cpc"},
    "organic": {"referrer": "https://www.google.com/"},
    "direct": {},
    "email": {"utm_source": "newsletter", "utm_medium": "email"},
}

# Amit a collector a fenti jelekből számol (az fp-collector
# pipeline.compute_source_medium függvénye). Az export ezen fordít vissza.
SOURCE_MEDIUM = {
    "google_ads": "google / cpc",
    "meta_ads": "facebook / cpc",
    "arukereso": "arukereso / cpc",
    "organic": "google / organic",
    "direct": "direct / none",
    "email": "newsletter / email",
}

# mélység: meddig jut el a session a tölcsérben
LANDING_ONLY, BROWSE, CART, CHECKOUT, PURCHASE = 0, 1, 2, 3, 4


@dataclass(frozen=True)
class Plan:
    """A kisorsolt terv. A session-szintű tömbök (n_session,) alakúak, a
    World.touches sorrendjében; az esemény-szintűek (n_events.sum(),)."""
    device: np.ndarray      # 0 vagy 1: a vásárló hányadik eszköze
    consent: np.ndarray     # bool: az eszköz adott-e consentet
    start_s: np.ndarray     # a session kezdete, másodperc éjféltől
    depth: np.ndarray       # LANDING_ONLY .. PURCHASE
    n_browse: np.ndarray    # böngésző-események száma (a landing után)
    n_events: np.ndarray    # a session összes egyedi eseménye
    order: np.ndarray       # a rendelés indexe a World.orders-ben, vagy -1
    offset: np.ndarray      # (n_session + 1,) a session első eseményének sorszáma
    # --- esemény-szintű ---
    gap_s: np.ndarray       # távolság az előző eseménytől, mp (a landingnél 0)
    is_item: np.ndarray     # bool: a böngésző-esemény termékoldal-e
    product: np.ndarray     # termék sorszáma, 1..n_products
    duplicate: np.ndarray   # bool: az esemény kétszer megy-e (ha el lett küldve)


def plan(world: World, cfg: WorldConfig, ecfg: EmitConfig) -> Plan:
    gen = streams(cfg.seed)["emit"]
    cust = world.touches["customer"]
    n = len(cust)

    # --- eszközök és consent: vásárlónként, egyszer és végleg ---
    van_masodik = gen.random(cfg.n_customers) < ecfg.second_device_share
    consent_eszkoz = gen.random((cfg.n_customers, 2)) >= ecfg.consent_decline_rate
    device = (van_masodik[cust]
              & (gen.random(n) < ecfg.second_device_session_share)).astype(np.int8)
    consent = consent_eszkoz[cust, device]

    # --- időpont a napon belül: a DGP csak napot ismer ---
    suly = np.array(ecfg.hour_weights, dtype=float)
    ora = gen.choice(24, size=n, p=suly / suly.sum())
    start_s = ora * 3600 + gen.integers(0, 3600, size=n)

    # --- tölcsér-mélység; a vásárló session mindig végigmegy ---
    order = np.full(n, -1, dtype=np.int64)
    order[world.orders["touch"]] = np.arange(len(world.orders["touch"]))
    bongesz = gen.random(n) < ecfg.p_browse
    kosar = bongesz & (gen.random(n) < ecfg.p_cart)
    penztar = kosar & (gen.random(n) < ecfg.p_checkout)
    depth = bongesz.astype(np.int8) + kosar + penztar
    depth[order >= 0] = PURCHASE

    n_browse = np.where(depth >= BROWSE,
                        1 + gen.poisson(ecfg.browse_mean - 1.0, size=n), 0)
    n_events = (1 + n_browse + (depth >= CART) + (depth >= CHECKOUT)
                + (depth == PURCHASE)).astype(np.int64)
    offset = np.concatenate([[0], np.cumsum(n_events)])
    osszes = int(offset[-1])

    # --- esemény-szintű sorsolások ---
    gap_s = ecfg.gap_min_s + gen.exponential(ecfg.gap_mean_s, size=osszes).astype(np.int64)
    gap_s[offset[:-1]] = 0
    is_item = gen.random(osszes) < ecfg.view_item_share
    product = gen.integers(1, ecfg.n_products + 1, size=osszes)
    duplicate = gen.random(osszes) < ecfg.duplicate_rate

    return Plan(device, consent, start_s, depth, n_browse, n_events, order, offset,
                gap_s, is_item, product, duplicate)


def summary(world: World, pl: Plan) -> dict:
    """A veszteség-főkönyv emit-oldala. Csak a tervből számol, eseményt nem gyárt."""
    c = pl.consent
    kuldott_dupla = np.repeat(c, pl.n_events) & pl.duplicate
    vasarlo = pl.order >= 0
    ertek = world.orders["value_huf"]
    eszkoz = world.touches["customer"].astype(np.int64) * 2 + pl.device
    return {
        "events_generated": int(pl.n_events.sum()),
        "events_withheld_no_consent": int(pl.n_events[~c].sum()),
        "events_sent_unique": int(pl.n_events[c].sum()),
        "events_sent_duplicate": int(kuldott_dupla.sum()),
        "sessions": int(len(c)),
        "sessions_consented": int(c.sum()),
        "orders": int(vasarlo.sum()),
        "orders_consented": int((vasarlo & c).sum()),
        "revenue_huf": int(ertek.sum()),
        "revenue_consented_huf": int(ertek[pl.order[vasarlo & c]].sum()),
        "customers": int(len(np.unique(world.touches["customer"]))),
        "customers_consented": int(len(np.unique(world.touches["customer"][c]))),
        "devices": int(len(np.unique(eszkoz))),
        "devices_consented": int(len(np.unique(eszkoz[c]))),
    }


def _id(*reszek) -> str:
    return str(uuid.uuid5(NAMESPACE, ":".join(str(r) for r in reszek)))


def customer_key(seed: int, customer: int) -> str:
    """Átlátszatlan vásárló-azonosító: a szegmenst vagy más latenst nem hordoz."""
    return _id("customer", seed, customer)


def events(world: World, cfg: WorldConfig, ecfg: EmitConfig, pl: Plan | None = None) -> Iterator[dict]:
    """Az események, session-sorrendben. Minden elem a collector POST-törzse.

    A consent nélkülieket is legyártja (consent_analytics: False): a load.py
    dolga, hogy ne küldje el őket. A duplikátum kétszer egymás után jön, és
    csak elküldhető eseményből lesz.
    """
    if pl is None:
        pl = plan(world, cfg, ecfg)
    seed = cfg.seed
    # A session- és eseményazonosító a világ IDŐSZAKÁT is hordozza: egy 30 napos
    # próbavilág nem a teljes világ első 30 napja (más a trend, mások a
    # sorsolások), ezért az azonosítóik sem eshetnek egybe.
    vilag_kulcs = f"{seed}:{cfg.start.isoformat()}:{cfg.end.isoformat()}"
    ejfel = datetime.combine(cfg.start, time(0), tzinfo=timezone.utc)
    cust = world.touches["customer"].tolist()
    nap = world.touches["day"].tolist()
    csat = world.touches["channel"].tolist()
    ertek = world.orders["value_huf"].tolist()
    device, consent = pl.device.tolist(), pl.consent.tolist()
    start_s, depth = pl.start_s.tolist(), pl.depth.tolist()
    n_browse, order = pl.n_browse.tolist(), pl.order.tolist()
    offset = pl.offset.tolist()
    gap_s, is_item = pl.gap_s.tolist(), pl.is_item.tolist()
    product, duplicate = pl.product.tolist(), pl.duplicate.tolist()

    for i in range(len(cust)):
        session_id = _id("session", vilag_kulcs, i)
        anonymous_id = _id("device", seed, cust[i], device[i])
        ido = ejfel + timedelta(days=nap[i], seconds=start_s[i])
        melyseg = depth[i]

        # (eseménynév, oldal, payload) — a session forgatókönyve
        lepesek = [("page_view", "/", {})]
        k0 = offset[i] + 1
        for j in range(n_browse[i]):
            k = k0 + j
            # kosár előtt az utolsó böngésző-esemény mindig termékoldal
            if is_item[k] or (melyseg >= CART and j == n_browse[i] - 1):
                lepesek.append(("view_item", f"/termek/{product[k]}",
                                {"item_id": f"sku-{product[k]:03d}"}))
            else:
                lepesek.append(("page_view", f"/kategoria/{product[k] % 12 + 1}", {}))
        if melyseg >= CART:
            sku = lepesek[-1][2]["item_id"]
            lepesek.append(("add_to_cart", lepesek[-1][1], {"item_id": sku}))
        if melyseg >= CHECKOUT:
            lepesek.append(("begin_checkout", "/penztar", {}))
        if melyseg == PURCHASE:
            lepesek.append(("purchase", "/koszonjuk", {
                "order_id": f"ord-{order[i]:06d}",
                "value": int(ertek[order[i]]),
                "currency": "HUF",
                "customer_key": customer_key(seed, cust[i]),
            }))

        for j, (nev, oldal, payload) in enumerate(lepesek):
            k = offset[i] + j
            ido += timedelta(seconds=gap_s[k])
            esemeny = {
                "event_id": _id("event", vilag_kulcs, i, j),
                "event_name": nev,
                "occurred_at": ido.isoformat(),
                "session_id": session_id,
                "anonymous_id": anonymous_id,
                "page_url": SITE + oldal,
                "consent_analytics": consent[i],
                "payload": payload,
            }
            if j == 0:
                esemeny.update(LANDING[ALL_SLUGS[csat[i]]])
            yield esemeny
            if duplicate[k] and consent[i]:
                yield esemeny

"""Vevők a pipeline-ból, és belőlük jellemző-mátrix a szegmentáló modellnek.

Ez a modell-oldal bemenete: csak azt látja, ami a pipeline adatbázisában van.
A generátor paramétereit és a világ igazság-fájlját nem olvassa (10. döntés,
1. szabály); a tests/test_attribution_models.py őrzi, hogy ez a fájl ne is
hivatkozzon az igazságot olvasó modulra.

Három lépés:
  fetch_today(conn)                     a pipeline utolsó eseményének ideje
  fetch_customers(conn)                 egy lekérdezés, vevőnként és csatornánként egy sor
  build_features(customers, today)      tiszta függvény, nincs benne I/O

Vevő az, akinek a person_id-je customer_key (van sora az identity_links-ben).
Aki nem vásárolt, az eszköz-szintű személy kosárérték nélkül: kimarad. A
vevő-szintű adat nem áll meg fájlban (3. szabály).
"""
from datetime import datetime
from itertools import groupby
from typing import Iterable, NamedTuple

import numpy as np
from psycopg.rows import tuple_row

from .config import ALL_SLUGS
from .emit import SOURCE_MEDIUM


class Customer(NamedTuple):
    customer_key: str
    orders: int
    revenue_huf: int
    first_order: datetime
    last_order: datetime
    sessions: int                        # a vevőhöz kötött sessionök száma
    sessions_by_channel: tuple[int, ...]  # 6 szám, ALL_SLUGS sorrendjében


# A 12 jellemző, sorrendben. A készlet a priori rögzített (spec 3.3): a standard
# RFM + csatorna-mix, amit egy elemző a pipeline-ból kiolvasna.
FEATURES = ("log_orders", "log_aov", "log_revenue", "recency_days", "tenure_days",
            "log_sessions") + tuple(f"share_{s}" for s in ALL_SLUGS)

# Az öt értékjellemző: a szokásos RFM-kör, csatorna nélkül. A segments mindkét készleten
# fut (58. döntés); mindkettő a priori rögzített, az eredmény láttán nem változik.
VALUE_FEATURES = FEATURES[:5]


def select(X: np.ndarray, features: tuple[str, ...]) -> np.ndarray:
    """Az X megnevezett oszlopai, a megadott sorrendben. A standardizálás oszloponkénti,
    tehát a kiválasztott oszlopok ugyanazok, mintha csak őket standardizáltuk volna."""
    return X[:, [FEATURES.index(f) for f in features]]

TODAY_SQL = "SELECT MAX(occurred_at) FROM clean_events"

# A rendelések az orders táblából vevőnként; a sessionök a resolved_events
# nézetből, a session ELSŐ eseményének forrásával (a többin nincs forrásjel).
# A JOIN a vevőre (person_id = customer_key) egyben a szűrő is: aki nem
# vásárolt, annak a person_id-je eszköz-azonosító, és nem illeszkedik.
CUSTOMERS_SQL = """
    WITH rendeles AS (
        SELECT customer_key, COUNT(*) AS orders, SUM(value) AS revenue_huf,
               MIN(occurred_at) AS first_order, MAX(occurred_at) AS last_order
        FROM orders
        GROUP BY customer_key
    ),
    elso AS (
        SELECT DISTINCT ON (session_id) session_id, person_id, source_medium
        FROM resolved_events
        ORDER BY session_id, occurred_at, id
    ),
    csatorna AS (
        SELECT person_id, source_medium, COUNT(*) AS sessions
        FROM elso
        GROUP BY person_id, source_medium
    )
    SELECT r.customer_key, r.orders, r.revenue_huf, r.first_order, r.last_order,
           c.source_medium, c.sessions
    FROM rendeles r JOIN csatorna c ON c.person_id = r.customer_key
    ORDER BY r.customer_key, c.source_medium
"""


def to_customers(rows: Iterable[tuple]) -> list[Customer]:
    """(customer_key, orders, revenue_huf, first_order, last_order, source_medium, sessions)
    sorokból vevőnként egy Customer. A sorok vevő szerint rendezettek."""
    slug = {sm: s for s, sm in SOURCE_MEDIUM.items()}
    ki: list[Customer] = []
    for key, csoport in groupby(rows, key=lambda r: r[0]):
        sorok = list(csoport)
        _, orders, revenue, first, last, _, _ = sorok[0]
        mix = [0] * len(ALL_SLUGS)
        for *_, source_medium, n in sorok:
            if source_medium not in slug:
                raise ValueError(f"ismeretlen source_medium a pipeline-ban: {source_medium!r}")
            mix[ALL_SLUGS.index(slug[source_medium])] += int(n)
        if revenue != int(revenue):
            raise ValueError(f"tört forint a pipeline-ban: {key!r} bevétele {revenue}")
        ki.append(Customer(key, int(orders), int(revenue), first, last, sum(mix), tuple(mix)))
    return ki


def fetch_today(conn) -> datetime:
    """A pipeline utolsó eseményének ideje: ehhez mér a recency és a tenure, nem a mai
    naphoz, hogy a futás determinisztikus legyen. Csak olvas."""
    return conn.cursor(row_factory=tuple_row).execute(TODAY_SQL).fetchone()[0]


def fetch_customers(conn) -> list[Customer]:
    """Minden azonosított vevő, customer_key szerint rendezve. Csak olvas."""
    return to_customers(conn.cursor(row_factory=tuple_row).execute(CUSTOMERS_SQL))


def raw_features(customers: list[Customer], today: datetime) -> np.ndarray:
    """n × 12, eredeti egységben, FEATURES sorrendben. A recency és a tenure napban,
    tört résszel."""
    nap = lambda t: (today - t).total_seconds() / 86_400
    orders = np.array([c.orders for c in customers], dtype=float)
    revenue = np.array([c.revenue_huf for c in customers], dtype=float)
    sessions = np.array([c.sessions for c in customers], dtype=float)
    mix = np.array([c.sessions_by_channel for c in customers], dtype=float)
    return np.column_stack([
        np.log(orders),
        np.log(revenue / orders),
        np.log(revenue),
        [nap(c.last_order) for c in customers],
        [nap(c.first_order) for c in customers],
        np.log(sessions),
        mix / sessions[:, None],
    ])


def build_features(customers: list[Customer], today: datetime) -> tuple[list[str], np.ndarray]:
    """(kulcsok, standardizált X): oszloponként átlag 0, szórás 1 a vevők közt.
    Egy állandó oszlop (szórás 0) 0 marad, nem NaN."""
    if not customers:
        raise ValueError("nincs vevő: üres listából nincs jellemző-mátrix")
    X = raw_features(customers, today)
    atlag, szoras = X.mean(axis=0), X.std(axis=0)
    szoras[szoras == 0] = 1.0
    return [c.customer_key for c in customers], (X - atlag) / szoras

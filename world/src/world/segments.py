"""k-means a pipeline vevőin k = 2…8-ra, két jellemzőkészleten, az igazsághoz mérve -> out/segments.json.

    uv run python -m world.segments

Futó helyi világ-instance kell hozzá (elég a `db` szolgáltatás). A vevő-szintű
adat nem áll meg fájlban: a futtató a DB-ből olvassa, és csak aggregátumot ír ki
(klaszterméret, profil, konfúzió); vevőnkénti címke nincs a fájlban.

A sorrend számít (1. szabály): előbb a k-means fut le minden k-ra (estimate), és
csak UTÁNA kerül mellé az igazság (assemble). Az igazság-fájlt továbbra is
egyedül a compare modul olvassa.

A futtató NEM ÍR FÁJLT, ha a DB nem az, amiből a commitolt events-fájlok
készültek: az azonosított vevők számát, a rendelések számát és összegét a
főkönyvhöz méri.
"""
import json

import numpy as np
import psycopg

from .compare import SEGMENTS, compare_segments, segments_truth
from .config import WORLD
from .customers import (FEATURES, VALUE_FEATURES, Customer, build_features, fetch_customers,
                        fetch_today, select)
from .export import DB_URL, OUT
from .local import require_local
from .models.segments import kmeans, silhouette

KS = tuple(range(2, 9))   # a klaszterszám, amit a néző választ
SEED = WORLD.seed         # a k-means++ sorsolásának és a silhouette-mintának a magja

# A két jellemzőkészlet, amin ugyanaz a k-means fut (58. döntés). A sorrend a fájlé és a
# lap kapcsolójáé: előbb a szűkebb.
FEATURE_SETS = {"value": VALUE_FEATURES, "all": FEATURES}


def check(customers: list[Customer], ledger: dict) -> list[str]:
    """Ugyanaz a DB-e, amiből az events_ledger.json készült? Üres lista = igen."""
    hibak = []

    def egyezik(mi, db, fokonyv):
        if db != fokonyv:
            hibak.append(f"{mi}: a DB-ben {db:,}, az events_ledger.json szerint {fokonyv:,}")

    egyezik("azonosított vevő", len(customers), ledger["identity"]["customers_identified"])
    egyezik("rendelés darab", sum(c.orders for c in customers), ledger["orders"]["pipeline"])
    egyezik("rendelés érték", sum(c.revenue_huf for c in customers),
            ledger["revenue_huf"]["pipeline"])
    return hibak


def profile(customers: list[Customer], labels: np.ndarray, k: int) -> list[dict]:
    """Klaszterenként a modell kimenete eredeti egységben: azt mutatja, mit nevezne az
    elemző a klasztereknek. A kosárérték a klaszter bevétele / a klaszter rendelései.
    Üres klaszter nullákkal áll."""
    orders = np.array([c.orders for c in customers], dtype=float)
    revenue = np.array([c.revenue_huf for c in customers], dtype=float)
    sessions = np.array([c.sessions for c in customers], dtype=float)
    mix = np.array([c.sessions_by_channel for c in customers], dtype=float)
    ki = []
    for j in range(k):
        m = labels == j
        if not m.any():
            ki.append({"customers": 0, "aov_huf": 0.0, "orders_per_customer": 0.0,
                       "sessions_per_customer": 0.0, "channel_share": [0.0] * mix.shape[1]})
            continue
        ki.append({
            "customers": int(m.sum()),
            "aov_huf": float(revenue[m].sum() / orders[m].sum()),
            "orders_per_customer": float(orders[m].mean()),
            "sessions_per_customer": float(sessions[m].mean()),
            "channel_share": (mix[m] / sessions[m, None]).mean(axis=0).tolist(),
        })
    return ki


def estimate(customers: list[Customer], X: np.ndarray) -> dict[int, dict]:
    """k-onként címkék, inercia, silhouette, méretek, profil. Igazságot nem lát és nem kap."""
    ki = {}
    for k in KS:
        labels, _, inertia = kmeans(X, k, SEED)
        ki[k] = {
            "labels": labels,
            "inertia": inertia,
            "silhouette": silhouette(X, labels, SEED),
            "sizes": np.bincount(labels, minlength=k).tolist(),
            "profiles": profile(customers, labels, k),
        }
    return ki


def assemble_set(becslesek: dict[int, dict], X: np.ndarray, features: tuple[str, ...],
                 truth_labels: list[str], all_labels: list[str]) -> tuple[dict, dict]:
    """Egy készlet kész becslései mellé az igazság. (a készlet blokkja, a szelekció)
    A default_k a silhouette argmaxa (holtversenyben a kisebb k)."""
    osszevetes = compare_segments({k: b["labels"] for k, b in becslesek.items()},
                                  X, truth_labels, all_labels)
    blokk = {
        "features": list(features),
        "default_k": max(KS, key=lambda k: becslesek[k]["silhouette"]),
        "ceiling": osszevetes["ceiling"],
        "by_k": {
            str(k): {
                "silhouette": b["silhouette"],
                "inertia": b["inertia"],
                "ari": osszevetes["by_k"][k]["ari"],
                "sizes": b["sizes"],
                "profiles": b["profiles"],
                "confusion": osszevetes["by_k"][k]["confusion"],
            }
            for k, b in becslesek.items()
        },
    }
    return blokk, osszevetes["selection"]


def assemble(becslesek: dict[str, dict[int, dict]], keys: list[str], X: np.ndarray,
             truth_labels: list[str], all_labels: list[str]) -> dict:
    """A segments.json tartalma: készletenként egy blokk. A szelekció a vevőkről szól,
    nem a jellemzőkről, ezért egyszer áll, felül."""
    blokkok, szelekcio = {}, None
    for nev, features in FEATURE_SETS.items():
        blokkok[nev], szelekcio = assemble_set(becslesek[nev], select(X, features), features,
                                               truth_labels, all_labels)
    return {
        "schema_version": 2,
        "ks": list(KS),
        "seed": SEED,
        "customers": len(keys),
        "segments": list(SEGMENTS),
        "selection": szelekcio,
        "feature_sets": list(FEATURE_SETS),
        "by_feature_set": blokkok,
    }


def main() -> None:
    dsn = require_local(DB_URL)
    ledger = json.loads((OUT / "events_ledger.json").read_text(encoding="utf-8"))

    print("Vevők beolvasása a helyi világ-DB-ből…")
    with psycopg.connect(dsn) as conn:
        conn.read_only = True
        today = fetch_today(conn)
        customers = fetch_customers(conn)

    hibak = check(customers, ledger)
    if hibak:
        raise SystemExit("NEM írok fájlt, mert a DB nem az, amiből az events-fájlok készültek:\n  - "
                         + "\n  - ".join(hibak))

    keys, X = build_features(customers, today)
    print(f"{len(keys):,} vevő; k-means k = {KS[0]}…{KS[-1]}, {len(FEATURE_SETS)} jellemzőkészleten…")
    # Előbb MINDEN becslés, és csak utána az igazság (1. szabály).
    becslesek = {nev: estimate(customers, select(X, features))
                 for nev, features in FEATURE_SETS.items()}
    truth_labels, all_labels = segments_truth(keys)
    adat = assemble(becslesek, keys, X, truth_labels, all_labels)

    (OUT / "segments.json").write_text(
        json.dumps(adat, ensure_ascii=False, indent=1), encoding="utf-8")
    for nev, keszlet in adat["by_feature_set"].items():
        print(f" {nev} ({len(keszlet['features'])} jellemző):")
        for k in KS:
            b = keszlet["by_k"][str(k)]
            print(f"  k={k}  silhouette {b['silhouette']:.3f}  ARI {b['ari']:.3f}  méretek {b['sizes']}")
        c = keszlet["ceiling"]
        print(f"  felső határ: ARI {c['ari']:.3f}, pontosság {c['accuracy']:.3f}; "
              f"a silhouette választása k = {keszlet['default_k']}")
    print("  segments.json\nkész.")


if __name__ == "__main__":
    main()

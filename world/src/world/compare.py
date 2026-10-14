"""AZ EGYETLEN MODUL, AMI A truth.json-T OLVASSA (10. döntés, 1. nem-tárgyalható szabály).

Egy modell soha nem hívhatja ezt illesztés közben — csak UTÁNA, a becslés
összevetésére. Ha egy modell látja az igazságot, minden "becslés vs. igazság"
sor hazugság lesz, és NEM FOG KIDERÜLNI: az eredmény csak jobb lesz tőle.
"""
import json
from pathlib import Path

import numpy as np

from .config import ALL_SLUGS, PAID_SLUGS, WORLD

TRUTH = Path(__file__).resolve().parents[2] / "out" / "truth.json"

# A négy szegmens a config sorrendjében: a konfúziós mátrix sorai, a szelekció
# arányai és a segments.json "segments" listája. A modell-oldal ezt nem látja.
SEGMENTS = tuple(s.slug for s in WORLD.segments)


def load_truth() -> dict:
    return json.loads(TRUTH.read_text(encoding="utf-8"))


def attribution_truth(truth: dict | None = None) -> dict[str, dict[str, float]]:
    """A három fizetett csatorna igazsága a két összevetési mértékben."""
    inc = (truth or load_truth())["incrementality"]
    return {s: {"share": inc[s]["share_of_revenue"], "roas": inc[s]["true_roas"]}
            for s in PAID_SLUGS}


def compare_attribution(
    revenue_by_model: dict[str, dict[str, float]],
    pipeline_revenue_huf: float,
    total_revenue_huf: float,
    spend_huf: dict[str, float],
    truth: dict[str, dict[str, float]],
) -> dict:
    """A modellek kiosztott bevételéből arány, ROAS és eltérés. A becslés UTÁN hívandó.

    revenue_by_model: {modell: {csatorna: kiosztott bevétel}} egy lookback-ablakra.
    truth: az attribution_truth() kimenete.

    Arány = kiosztott bevétel / a pipeline teljes bevétele (ALL_SLUGS sorrendben).
    ROAS  = arány × a bolt teljes bevétele / a csatorna költése (PAID_SLUGS sorrendben).
    Eltérés = |arány − igazság| átlaga a három fizetett csatornán, százalékpontban.
    """
    share, roas, error = {}, {}, {}
    for modell, bevetel in revenue_by_model.items():
        arany = {s: bevetel.get(s, 0.0) / pipeline_revenue_huf for s in ALL_SLUGS}
        share[modell] = [arany[s] for s in ALL_SLUGS]
        roas[modell] = [arany[s] * total_revenue_huf / spend_huf[s] for s in PAID_SLUGS]
        error[modell] = 100 * sum(abs(arany[s] - truth[s]["share"])
                                  for s in PAID_SLUGS) / len(PAID_SLUGS)
    return {"share": share, "roas": roas, "mean_abs_error_pp": error}


# ---- segments (57. döntés) ----


def segments_truth(keys: list[str], truth: dict | None = None) -> tuple[list[str], list[str]]:
    """(a klaszterezett vevők szegmense `keys` sorrendjében, mind a vásárló szegmense).

    Névre illeszt: a kulcs az emit.customer_key uuid5-je, amit a pipeline is lát. Ha a
    pipeline egy kulcsa nincs az igazságban, a DB nem ebből a világból való: hiba, nem
    csendes kihagyás. Csak a becslés UTÁN hívható.
    """
    kiosztas = (truth or load_truth())["segment_assignment"]
    hianyzo = [k for k in keys if k not in kiosztas]
    if hianyzo:
        raise ValueError(f"{len(hianyzo)} customer_key nincs az igazságban (más világ-DB?), "
                         f"pl. {hianyzo[0]!r}")
    return [kiosztas[k] for k in keys], list(kiosztas.values())


def adjusted_rand_index(a, b) -> float:
    """Két címkézés egyezése a pontpárok szintjén, a véletlenhez igazítva (ARI).

    1 = ugyanaz a felosztás (a címkék neve nem számít), 0 ≈ független címkézés,
    lehet negatív. Ha mindkét oldal egy csoport, a nevező 0: 1-et ad, mint a
    scikit-learn.
    """
    a = np.unique(np.asarray(a), return_inverse=True)[1].reshape(-1)
    b = np.unique(np.asarray(b), return_inverse=True)[1].reshape(-1)
    ct = np.zeros((a.max() + 1, b.max() + 1))
    np.add.at(ct, (a, b), 1.0)
    parok = lambda x: float((x * (x - 1) / 2).sum())
    egyezo, sor, oszlop = parok(ct), parok(ct.sum(axis=1)), parok(ct.sum(axis=0))
    osszes = len(a) * (len(a) - 1) / 2
    vart = sor * oszlop / osszes
    nevezo = (sor + oszlop) / 2 - vart
    return 1.0 if nevezo == 0 else (egyezo - vart) / nevezo


def compare_segments(labels_by_k: dict[int, np.ndarray], X: np.ndarray,
                     truth_labels: list[str], all_labels: list[str]) -> dict:
    """Konfúzió és ARI minden k-ra, a felső határ egyszer, és a szelekció. A becslés UTÁN.

    labels_by_k: {k: címkék (n,)} ugyanazon az X-en.
    truth_labels: az X soraihoz igazított igazság (a segments_truth első tagja).
    all_labels: mind a vásárló igazsága (a második tagja), a szelekcióhoz.

    Konfúzió: 4 sor (SEGMENTS) × k oszlop, darabszámban. Felső határ: legközelebbi-
    centroid osztályozó az igazság centroidjaival ugyanezen az X-en — azt méri,
    mennyire választhatók szét a típusok ebben a geometriában, ha a címkék ismertek
    volnának. Igazságból számolt szám.
    """
    n = len(truth_labels)
    if len(X) != n or any(len(labels) != n for labels in labels_by_k.values()):
        raise ValueError(f"a címkék, az X és az igazság hossza nem egyezik ({n} igazság-címke)")
    igaz = np.array([SEGMENTS.index(s) for s in truth_labels])
    by_k = {}
    for k, labels in labels_by_k.items():
        ct = np.zeros((len(SEGMENTS), k), dtype=int)
        np.add.at(ct, (igaz, np.asarray(labels)), 1)
        by_k[k] = {"ari": adjusted_rand_index(igaz, labels), "confusion": ct.tolist()}

    C = np.array([X[igaz == j].mean(axis=0) if np.any(igaz == j) else np.full(X.shape[1], np.inf)
                  for j in range(len(SEGMENTS))])
    joslat = ((X[:, None, :] - C[None, :, :]) ** 2).sum(axis=2).argmin(axis=1)

    arany = lambda cimkek: [cimkek.count(s) / len(cimkek) for s in SEGMENTS]
    return {
        "selection": {"all": arany(all_labels), "clustered": arany(truth_labels)},
        "ceiling": {"ari": adjusted_rand_index(igaz, joslat),
                    "accuracy": float((joslat == igaz).mean())},
        "by_k": by_k,
    }

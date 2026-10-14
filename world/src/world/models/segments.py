"""k-means és silhouette tiszta numpy-ban: a segments műszer modellje.

Semmit nem importál a world csomagból, és nem látja az igazságot (1. szabály);
a tests/test_attribution_models.py őrzi, hogy a forrásban ne is szerepeljen az
igazságot olvasó modul neve. A scikit-learn csak a tesztekben keresztellenőriz,
a szállított kód nem függ tőle.

  kmeans(X, k, seed, restarts, iters) -> (címkék, centroidok, inercia)
  silhouette(X, labels, seed, sample) -> float
"""
import numpy as np


def _tavolsag2(X: np.ndarray, C: np.ndarray) -> np.ndarray:
    """(n, k): minden pont négyzetes euklideszi távolsága minden centroidtól.
    |x − c|² = |x|² + |c|² − 2 x·c: nem épít (n, k, d) tömböt."""
    d = (X ** 2).sum(axis=1)[:, None] + (C ** 2).sum(axis=1)[None, :] - 2.0 * X @ C.T
    return np.maximum(d, 0.0)


def _kmeans_pp(X: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    """k-means++ indítás: az első centroid véletlen pont, a többi a legközelebbi
    centroidtól mért négyzetes távolság arányában sorsolva. Ha minden hátralévő
    távolság 0 (duplikált pontok), a sorsolás egyenletes."""
    C = [X[rng.integers(len(X))]]
    for _ in range(1, k):
        d = _tavolsag2(X, np.array(C)).min(axis=1)
        osszeg = d.sum()
        p = d / osszeg if osszeg > 0 else None
        C.append(X[rng.choice(len(X), p=p)])
    return np.array(C)


def _lloyd(X: np.ndarray, C: np.ndarray, iters: int) -> tuple[np.ndarray, np.ndarray, float]:
    """Lloyd-iteráció: besorolás, majd a centroid a tagok átlagába. Üres klaszter a
    centroidját tartja. Megáll, ha a centroidok nem mozdulnak (az np.allclose
    alap tűrésén belül: rtol 1e-5, atol 1e-8)."""
    for _ in range(iters):
        labels = _tavolsag2(X, C).argmin(axis=1)
        uj = np.array([X[labels == j].mean(axis=0) if np.any(labels == j) else C[j]
                       for j in range(len(C))])
        mozdult = not np.allclose(uj, C)
        C = uj
        if not mozdult:
            break
    labels = _tavolsag2(X, C).argmin(axis=1)
    inertia = float(((X - C[labels]) ** 2).sum())
    return labels, C, inertia


def kmeans(X: np.ndarray, k: int, seed: int, restarts: int = 10, iters: int = 100,
           ) -> tuple[np.ndarray, np.ndarray, float]:
    """`restarts` független k-means++ indítás, mindegyik Lloyd-iterációval
    konvergenciáig (legfeljebb `iters` lépés); a legkisebb inerciájú marad.
    Ugyanarra a seedre ugyanaz az eredmény."""
    if not 1 <= k <= len(X):
        raise ValueError(f"k = {k} nem lehet: {len(X)} pont van")
    if restarts < 1:
        raise ValueError(f"restarts = {restarts} nem lehet: legalább egy indítás kell")
    rng = np.random.default_rng(seed)
    legjobb = None
    for _ in range(restarts):
        eredmeny = _lloyd(X, _kmeans_pp(X, k, rng), iters)
        if legjobb is None or eredmeny[2] < legjobb[2]:
            legjobb = eredmeny
    return legjobb


def silhouette(X: np.ndarray, labels: np.ndarray, seed: int, sample: int = 2000) -> float:
    """Átlagos silhouette egy `sample` elemű véletlen mintán (n² távolság helyett).

    s(i) = (b − a) / max(a, b): a = átlagtávolság a saját klaszter többi tagjától,
    b = a legközelebbi másik klaszter tagjaitól. Egyelemű klaszter tagja 0-t kap,
    mint a scikit-learnben. Ha n ≤ sample, a minta a teljes halmaz.
    """
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(X), size=min(sample, len(X)), replace=False)
    Xs, ls = X[idx], np.asarray(labels)[idx]
    klaszterek = np.unique(ls)
    if len(klaszterek) < 2:
        raise ValueError("a silhouette-hez legalább két klaszter kell a mintában")
    D = np.sqrt(_tavolsag2(Xs, Xs))
    s = np.zeros(len(Xs))
    for i in range(len(Xs)):
        sajat = ls == ls[i]
        sajat[i] = False
        if not sajat.any():
            continue
        a = D[i, sajat].mean()
        b = min(D[i, ls == j].mean() for j in klaszterek if j != ls[i])
        s[i] = (b - a) / max(a, b)
    return float(s.mean())

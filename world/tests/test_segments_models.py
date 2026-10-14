import numpy as np
import pytest
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from world.models.segments import kmeans, silhouette

SEED = 7


def blobs(kozeppontok, n_per, szoras, seed=1):
    """`len(kozeppontok)` gömbölyű csomó 12 dimenzióban; visszaad (X, igazság-index)."""
    rng = np.random.default_rng(seed)
    X, y = [], []
    for j, kp in enumerate(kozeppontok):
        kozep = np.zeros(12)
        kozep[:len(kp)] = kp
        X.append(kozep + rng.normal(0.0, szoras, size=(n_per, 12)))
        y.append(np.full(n_per, j))
    return np.vstack(X), np.concatenate(y)


JOL_ELVALO = blobs([(0, 0), (10, 0), (0, 10), (10, 10)], 100, 0.5)
ATFEDO = blobs([(0, 0), (2, 0), (0, 2), (2, 2), (1, 1)], 120, 1.0, seed=3)


def ugyanaz_a_felosztas(a, b) -> bool:
    """Két címkézés ugyanaz a felosztás, ha a párok ugyanúgy esnek egybe (a nevek nem számítanak)."""
    return len({(x, y) for x, y in zip(a, b)}) == len(set(a)) == len(set(b))


def test_negy_jol_elvalo_csomot_hibatlanul_visszaad():
    X, y = JOL_ELVALO
    labels, C, inertia = kmeans(X, 4, SEED)
    assert labels.shape == (400,) and C.shape == (4, 12)
    assert ugyanaz_a_felosztas(labels, y)
    assert inertia == pytest.approx(((X - C[labels]) ** 2).sum())


def test_ugyanarra_a_seedre_ugyanaz_az_eredmeny():
    X, _ = ATFEDO
    a, b = kmeans(X, 5, SEED), kmeans(X, 5, SEED)
    assert np.array_equal(a[0], b[0]) and a[2] == b[2]


def test_az_inercia_nem_no_az_iteraciokkal():
    X, _ = ATFEDO
    inerciak = [kmeans(X, 3, SEED, restarts=1, iters=i)[2] for i in (1, 2, 5, 50)]
    assert inerciak == sorted(inerciak, reverse=True)


def test_duplikalt_pontokon_sem_all_meg():
    """Ha k nagyobb a különböző pontok számánál, a k-means++ súlya 0/0 lenne."""
    X = np.repeat(np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]]), 4, axis=0)
    labels, _, inertia = kmeans(X, 4, SEED, restarts=2)
    assert inertia == pytest.approx(0.0)
    assert len(set(labels[:4])) == 1


@pytest.mark.parametrize("k", [0, 13])
def test_lehetetlen_k_megnevezett_hiba(k):
    X = np.zeros((12, 2))
    with pytest.raises(ValueError, match="nem lehet"):
        kmeans(X, k, SEED)


def test_nulla_inditas_megnevezett_hiba():
    with pytest.raises(ValueError, match="legalább egy indítás"):
        kmeans(np.zeros((12, 2)), 2, SEED, restarts=0)


# Ha ez bukik (pl. egy uv.lock frissítés új scikit-learnt hoz; k = 8-nál a tartalék
# vékony): NE a küszöböt lazítsd. Az üzenet (sajat, sk) párja megmutatja, melyik oldal
# talált kisebb inerciát; ha a scikit-learn, a saját k-means romlott el.
@pytest.mark.parametrize("k", range(2, 9))
def test_keresztellenorzes_az_inercia_1_szazalekon_belul_a_scikit_learnhez(k):
    X, _ = ATFEDO
    sajat = kmeans(X, k, SEED)[2]
    sk = KMeans(n_clusters=k, n_init=10, random_state=0).fit(X).inertia_
    assert sajat == pytest.approx(sk, rel=0.01), (sajat, sk)


def test_keresztellenorzes_a_silhouette_a_scikit_learne():
    """n ≤ sample: a minta a teljes halmaz, a két szám ugyanaz a képlet."""
    X, _ = ATFEDO
    labels = kmeans(X, 5, SEED)[0]
    assert silhouette(X, labels, SEED) == pytest.approx(silhouette_score(X, labels), abs=1e-6)


def test_a_silhouette_mintaja_a_seedre_determinisztikus_es_kicsit_szor():
    rng = np.random.default_rng(11)
    X = np.vstack([rng.normal(0, 1, (3000, 12)), rng.normal(4, 1, (3000, 12))])
    labels = (np.arange(6000) >= 3000).astype(int)
    a = silhouette(X, labels, SEED, sample=2000)
    assert a == silhouette(X, labels, SEED, sample=2000)
    b = silhouette(X, labels, SEED + 1, sample=2000)
    assert abs(a - b) < 0.02


def test_a_silhouette_jol_elvalo_csomokon_magas_veletlen_cimken_nulla_korul():
    X, y = JOL_ELVALO
    assert silhouette(X, y, SEED) > 0.7
    veletlen = np.random.default_rng(5).integers(0, 4, size=len(X))
    assert abs(silhouette(X, veletlen, SEED)) < 0.1


def test_egy_klaszterre_nincs_silhouette():
    X, _ = JOL_ELVALO
    with pytest.raises(ValueError, match="legalább két klaszter"):
        silhouette(X, np.zeros(len(X), dtype=int), SEED)

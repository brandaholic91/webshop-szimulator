import json

import numpy as np
import pytest
from sklearn.metrics import adjusted_rand_score

from world.compare import SEGMENTS, adjusted_rand_index, compare_segments, segments_truth
from world.config import WORLD


def test_a_szegmensek_sorrendje_a_confige():
    assert SEGMENTS == tuple(s.slug for s in WORLD.segments)
    assert SEGMENTS == ("alkalmi", "arvadasz", "markahu", "nagykosaras")


def test_ari_azonos_es_permutalt_cimkekre_1():
    a = [0, 0, 1, 1, 2, 2]
    assert adjusted_rand_index(a, a) == 1.0
    assert adjusted_rand_index(a, ["c", "c", "a", "a", "b", "b"]) == 1.0


def test_ari_fuggetlen_cimkekre_nulla_korul():
    rng = np.random.default_rng(1)
    a, b = rng.integers(0, 4, 5000), rng.integers(0, 3, 5000)
    assert abs(adjusted_rand_index(a, b)) < 0.01


def test_ari_keresztellenorzes_a_scikit_learnhez():
    rng = np.random.default_rng(2)
    a = rng.integers(0, 4, 500)
    b = np.where(rng.random(500) < 0.7, a, rng.integers(0, 4, 500))
    assert adjusted_rand_index(a, b) == pytest.approx(adjusted_rand_score(a, b), abs=1e-12)


def test_ari_egyetlen_klaszterre_1():
    """Mindkét oldalon egy csoport: a nevező 0, az egyezés teljes (scikit-learn konvenció)."""
    assert adjusted_rand_index([0, 0, 0], [1, 1, 1]) == 1.0


# Két jól elváló csomó; a világ négy szegmenséből csak két sor van kitöltve.
X = np.array([[0, 0], [0, 1], [1, 0], [10, 10], [10, 11], [11, 10]], dtype=float)
IGAZ = ["alkalmi"] * 3 + ["markahu"] * 3
MIND = ["alkalmi"] * 8 + ["markahu"] * 2


def test_konfuzio_ari_felso_hatar_es_szelekcio_kezzel_kiszamolva():
    ki = compare_segments({2: np.array([1, 1, 1, 0, 0, 0]), 3: np.array([0, 0, 1, 2, 2, 2])},
                          X, IGAZ, MIND)
    # sor = a világ szegmense (config-sorrend), oszlop = klaszter, darabszámban
    assert ki["by_k"][2] == {"ari": 1.0, "confusion": [[0, 3], [0, 0], [3, 0], [0, 0]]}
    assert ki["by_k"][3]["confusion"] == [[2, 1, 0], [0, 0, 0], [0, 0, 3], [0, 0, 0]]
    # párok: egyező 4, igazságban 6, klaszterben 4, összes 15; várt 1,6 -> (4−1,6)/(5−1,6)
    assert ki["by_k"][3]["ari"] == pytest.approx(2.4 / 3.4)
    assert ki["ceiling"] == {"ari": 1.0, "accuracy": 1.0}
    assert ki["selection"] == {"all": [0.8, 0.0, 0.2, 0.0], "clustered": [0.5, 0.0, 0.5, 0.0]}
    json.dumps(ki)   # sorosítható, nincs benne numpy-típus


def test_a_felso_hatar_az_igazsag_centroidjaival_oszt_nem_a_klaszterekkel():
    # egy alkalmi vevő a markahu csomó mellett ül: az igazság-centroid (2,25; 2,25) helyett
    # a (10,3; 10,3) van közelebb hozzá, tehát a felső határ is rossz helyre teszi
    X2 = np.vstack([X, [[8.0, 8.0]]])
    ki = compare_segments({2: np.zeros(7, dtype=int)}, X2, IGAZ + ["alkalmi"], MIND)
    assert ki["ceiling"]["accuracy"] == pytest.approx(6 / 7)
    assert ki["by_k"][2]["ari"] == pytest.approx(0.0, abs=1e-12)   # egy klaszter: nincs visszanyerés


def test_elcsuszott_hossz_megnevezett_hiba():
    with pytest.raises(ValueError, match="hossza nem egyezik"):
        compare_segments({2: np.zeros(5, dtype=int)}, X, IGAZ, MIND)
    with pytest.raises(ValueError, match="hossza nem egyezik"):
        compare_segments({2: np.zeros(6, dtype=int)}, X[:5], IGAZ, MIND)


def test_segments_truth_kulcs_szerint_illeszt_es_a_par_masodik_tagja_mindenki():
    fajl = {"segment_assignment": {"a": "alkalmi", "b": "markahu", "c": "alkalmi"}}
    assert segments_truth(["b", "a"], fajl) == (["markahu", "alkalmi"],
                                                ["alkalmi", "markahu", "alkalmi"])


def test_hianyzo_kulcs_megnevezett_hiba():
    with pytest.raises(ValueError, match="nincs az igazságban"):
        segments_truth(["a", "zzz"], {"segment_assignment": {"a": "alkalmi"}})


def test_a_commitolt_igazsagbol_is_kiolvashato():
    cimkek, mind = segments_truth([])
    assert cimkek == []
    assert len(mind) == WORLD.n_customers and set(mind) == set(SEGMENTS)

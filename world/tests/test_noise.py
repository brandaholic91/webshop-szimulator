import numpy as np

from world.config import WORLD
from world.noise import replica_streams
from world.rng import streams


def test_a_replika_a_populaciot_es_a_koltest_nem_mozditja():
    """A zaj mérése csak akkor ér valamit, ha ugyanazt a boltot futtatja újra:
    ugyanazok a vásárlók, ugyanaz a költés, más sorsolás."""
    eredeti, replika = streams(WORLD.seed), replica_streams(WORLD.seed, 1)
    for nev in ("population", "spend"):
        assert eredeti[nev].random() == replika[nev].random(), nev
    for nev in ("touch", "conversion", "orders"):
        assert eredeti[nev].random() != replika[nev].random(), nev


def test_ket_replika_kulonbozik_es_ujrajatszhato():
    a = replica_streams(WORLD.seed, 1)["touch"].random(4)
    assert not np.array_equal(a, replica_streams(WORLD.seed, 2)["touch"].random(4))
    assert np.array_equal(a, replica_streams(WORLD.seed, 1)["touch"].random(4))

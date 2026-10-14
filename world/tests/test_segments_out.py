"""A commitolt out/segments.json őrei. Két fajta teszt van benne: az összefüggések,
amiknek bármilyen világon állniuk kell, és a négy lecke-sáv (58. döntés), ami azt őrzi,
hogy a világban van megtalálható szerkezet. A sávok a specben a hangolás előtt rögzültek."""
import json

import pytest

from world.compare import SEGMENTS, segments_truth
from world.customers import FEATURES, VALUE_FEATURES
from world.segments import FEATURE_SETS, KS, SEED
from world.truth import OUT


@pytest.fixture(scope="module")
def adat():
    return json.loads((OUT / "segments.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ledger():
    return json.loads((OUT / "events_ledger.json").read_text(encoding="utf-8"))


def test_a_fajl_fejlece(adat):
    assert adat["schema_version"] == 2
    assert adat["ks"] == list(KS) and adat["seed"] == SEED
    assert adat["segments"] == list(SEGMENTS)
    assert adat["feature_sets"] == list(FEATURE_SETS) == ["value", "all"]
    assert adat["by_feature_set"]["value"]["features"] == list(VALUE_FEATURES)
    assert adat["by_feature_set"]["all"]["features"] == list(FEATURES)
    for keszlet in adat["by_feature_set"].values():
        assert list(keszlet["by_k"]) == [str(k) for k in KS]


def test_a_default_k_a_silhouette_valasztasa(adat):
    """A lap alapállása nem kézzel beírt: készletenként a silhouette argmaxa."""
    for nev, keszlet in adat["by_feature_set"].items():
        sil = {int(k): b["silhouette"] for k, b in keszlet["by_k"].items()}
        assert keszlet["default_k"] == max(KS, key=lambda k: sil[k]), nev


def test_a_vevok_szama_a_fokonyve(adat, ledger):
    assert adat["customers"] == ledger["identity"]["customers_identified"]


def test_minden_keszletben_es_k_nal_minden_vevo_pontosan_egy_klaszterben_es_egy_sorban_van(adat):
    n = adat["customers"]
    sorok_elso = None
    for nev, keszlet in adat["by_feature_set"].items():
        for k, b in keszlet["by_k"].items():
            hol = (nev, k)
            assert sum(b["sizes"]) == n, hol
            assert len(b["confusion"]) == 4 and all(len(sor) == int(k) for sor in b["confusion"]), hol
            assert [sum(oszlop) for oszlop in zip(*b["confusion"])] == b["sizes"], hol
            sorok = [sum(sor) for sor in b["confusion"]]
            assert sum(sorok) == n
            if sorok_elso is None:
                sorok_elso = sorok
            assert sorok == sorok_elso, hol   # az igazság nem mozdul sem a k-val, sem a készlettel
            assert len(b["profiles"]) == int(k)
            assert [p["customers"] for p in b["profiles"]] == b["sizes"], hol
            for p in b["profiles"]:
                if p["customers"]:
                    assert p["aov_huf"] > 0 and p["orders_per_customer"] >= 1
                    assert sum(p["channel_share"]) == pytest.approx(1.0)
            assert -1 <= b["ari"] <= 1 and -1 <= b["silhouette"] <= 1 and b["inertia"] > 0


def test_a_szelekcio_az_igazsag_aranyai(adat):
    _, mind = segments_truth([])
    assert adat["selection"]["all"] == pytest.approx(
        [mind.count(s) / len(mind) for s in SEGMENTS])
    assert sum(adat["selection"]["clustered"]) == pytest.approx(1.0)
    sorok = [sum(sor) for sor in adat["by_feature_set"]["all"]["by_k"]["2"]["confusion"]]
    assert adat["selection"]["clustered"] == pytest.approx([s / adat["customers"] for s in sorok])


def test_a_felso_hatar_ertelmes(adat):
    for keszlet in adat["by_feature_set"].values():
        assert 0 < keszlet["ceiling"]["accuracy"] <= 1
        assert -1 <= keszlet["ceiling"]["ari"] <= 1


# ---- lecke-sávok (58. döntés): „azt találod meg, amit a modellnek megmutatsz" ----


def test_lecke_a_tipusok_szetvalaszthatok_ha_a_cimkek_ismertek(adat):
    """Ha a címkéket ismerő osztályozó sem találja el a vevők 85%-át, a világban nincs mit
    megtalálni, és a k-means gyengesége a világ hibája volna, nem a módszeré."""
    assert adat["by_feature_set"]["all"]["ceiling"]["accuracy"] >= 0.85


def test_lecke_a_teljes_keszleten_a_kmeans_visszanyeri_a_negy_tipust(adat):
    assert adat["by_feature_set"]["all"]["by_k"]["4"]["ari"] >= 0.5


def test_lecke_az_ot_ertekjellemzon_ugyanaz_a_kmeans_erdemben_kevesebbet_talal(adat):
    teljes = adat["by_feature_set"]["all"]["by_k"]["4"]["ari"]
    ertek = adat["by_feature_set"]["value"]["by_k"]["4"]["ari"]
    assert ertek <= teljes - 0.2, f"érték {ertek:.3f}, teljes {teljes:.3f}"


def test_lecke_a_teljes_keszleten_a_silhouette_a_negy_tipust_valasztja(adat):
    assert adat["by_feature_set"]["all"]["default_k"] == 4

import pytest

from world.compare import attribution_truth, compare_attribution
from world.config import ALL_SLUGS, PAID_SLUGS

IGAZSAG = {
    "google_ads": {"share": 0.10, "roas": 2.0},
    "meta_ads": {"share": 0.20, "roas": 8.0},
    "arukereso": {"share": 0.05, "roas": 4.0},
}
KOLTES = {"google_ads": 100.0, "meta_ads": 50.0, "arukereso": 25.0}


def test_az_igazsag_a_harom_fizetett_csatornara_ket_mertekben():
    fajl = {"incrementality": {s: {"share_of_revenue": 0.1 * (i + 1), "true_roas": 2.0 + i,
                                   "spend_huf": 1.0}
                               for i, s in enumerate(PAID_SLUGS)}}
    assert attribution_truth(fajl) == {
        "google_ads": {"share": pytest.approx(0.1), "roas": 2.0},
        "meta_ads": {"share": pytest.approx(0.2), "roas": 3.0},
        "arukereso": {"share": pytest.approx(0.3), "roas": 4.0},
    }


def test_a_commitolt_igazsag_fajlbol_is_kiolvashato():
    igazsag = attribution_truth()
    assert list(igazsag) == list(PAID_SLUGS)
    for adat in igazsag.values():
        assert 0 < adat["share"] < 1 and adat["roas"] > 0


def test_arany_roas_es_elteres_kezzel_kiszamolva():
    # a pipeline 1000 Ft-ot lát, a bolt teljes bevétele 2000 Ft
    becsles = {"m": {"google_ads": 300.0, "meta_ads": 100.0, "organic": 600.0}}
    ki = compare_attribution(becsles, 1000.0, 2000.0, KOLTES, IGAZSAG)

    assert ki["share"]["m"] == pytest.approx([0.3, 0.1, 0.0, 0.6, 0.0, 0.0])
    assert len(ki["share"]["m"]) == len(ALL_SLUGS)
    # ROAS = arány × 2000 / költés
    assert ki["roas"]["m"] == pytest.approx([6.0, 4.0, 0.0])
    # |0,3−0,1| + |0,1−0,2| + |0−0,05| = 0,35; / 3 = 0,11667 -> 11,667 százalékpont
    assert ki["mean_abs_error_pp"]["m"] == pytest.approx(35 / 3)


def test_modellenkent_kulon_sor_es_a_tokeletes_becsles_elterese_nulla():
    tokeletes = {s: 1000.0 * IGAZSAG[s]["share"] for s in PAID_SLUGS}
    ki = compare_attribution({"jo": tokeletes, "rossz": {"google_ads": 1000.0}},
                             1000.0, 2000.0, KOLTES, IGAZSAG)
    assert set(ki["share"]) == set(ki["roas"]) == set(ki["mean_abs_error_pp"]) == {"jo", "rossz"}
    assert ki["mean_abs_error_pp"]["jo"] == pytest.approx(0.0)
    assert ki["mean_abs_error_pp"]["rossz"] > 0

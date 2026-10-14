from pathlib import Path as FsPath

import pytest

import world.customers
import world.journeys
import world.models.attribution
import world.models.segments
from world.journeys import Path
from world.models.attribution import last_click, linear, markov, removal_effects, time_decay


def conv(channels, days, value):
    return Path(tuple(channels), tuple(float(d) for d in days), value)


def lost(*channels):
    return Path(tuple(channels), tuple(0.0 for _ in channels), None)


def test_last_click_az_utolso_session_csatornajanak_ad_mindent():
    utak = [conv(["meta_ads", "google_ads"], [3, 0], 1000),
            conv(["google_ads"], [0], 500),
            conv(["organic", "email"], [1, 0], 200),
            lost("meta_ads")]
    assert last_click(utak) == {"google_ads": 1500, "email": 200}


def test_linear_egyenloen_oszt_es_az_ismetles_szamit():
    utak = [conv(["meta_ads", "google_ads", "google_ads"], [5, 2, 0], 900), lost("meta_ads")]
    assert linear(utak) == pytest.approx({"meta_ads": 300, "google_ads": 600})


def test_time_decay_het_naponkent_felezodik():
    # súlyok: 14 nap -> 0,25; 7 nap -> 0,5; 0 nap -> 1; összeg 1,75
    utak = [conv(["organic", "meta_ads", "google_ads"], [14, 7, 0], 700)]
    assert time_decay(utak) == pytest.approx({"organic": 100, "meta_ads": 200, "google_ads": 400})


def test_egyetlen_sessionbol_allo_utvonalon_mind_a_negy_ugyanazt_adja():
    utak = [conv(["direct"], [0], 400)]
    for modell in (last_click, linear, time_decay, markov):
        assert modell(utak) == pytest.approx({"direct": 400}), modell.__name__


# A kézzel megoldható lánc. Átmenetek:
#   START -> A: 2, START -> B: 2;  A -> B: 1, A -> NULL: 1;  B -> CONV: 2, B -> NULL: 1
# P(konverzió | B) = 2/3;  P(konverzió | A) = 1/2 * 2/3 = 1/3
# P(konverzió) = 1/2 * 1/3 + 1/2 * 2/3 = 1/2
# A nélkül: 1/2 * 2/3 = 1/3  -> removal effect = 1 - (1/3)/(1/2) = 1/3
# B nélkül: 0                -> removal effect = 1
# részesedés: A = (1/3)/(4/3) = 1/4, B = 3/4;  a 200 Ft-ból A 50, B 150
MARKOV_PELDA = [conv(["A", "B"], [1, 0], 100), lost("A"), conv(["B"], [0], 100), lost("B")]


def test_a_markov_removal_effectje_a_kezzel_megoldott_lancon():
    assert removal_effects(MARKOV_PELDA) == pytest.approx({"A": 1 / 3, "B": 1.0})


def test_a_markov_a_removal_effectek_aranyaban_oszt():
    assert markov(MARKOV_PELDA) == pytest.approx({"A": 50, "B": 150})


@pytest.mark.parametrize("modell", [last_click, linear, time_decay, markov])
def test_minden_modell_a_teljes_bevetelt_osztja_szet(modell):
    utak = [conv(["meta_ads", "organic", "google_ads"], [20, 6, 0], 12_000),
            conv(["email"], [0], 8_000),
            conv(["arukereso", "arukereso"], [2, 0], 5_000),
            conv(["direct", "meta_ads"], [9, 0], 30_000),
            lost("organic", "direct"), lost("meta_ads"), lost("google_ads", "email")]
    assert sum(modell(utak).values()) == pytest.approx(55_000)


@pytest.mark.parametrize("modul", [world.journeys, world.models.attribution,
                                   world.customers, world.models.segments])
def test_a_modell_oldal_nem_hivatkozik_az_igazsagot_olvaso_modulra(modul):
    """1. nem-tárgyalható szabály. Ha egy modell látja az igazságot, az eredmény
    csak jobb lesz tőle, és nem derül ki. A két szó a forrásban sehol nem állhat:
    se importban, se megjegyzésben."""
    forras = FsPath(modul.__file__).read_text(encoding="utf-8")
    assert "compare" not in forras
    assert "truth" not in forras

from dataclasses import replace
from datetime import date

import numpy as np
import pytest
from world.config import WORLD, PAID_SLUGS
from world.rng import streams
from world.dgp import build_population, build_spend, seasonality


@pytest.fixture(scope="module")
def vilag():
    return run(WORLD)


def test_a_populacio_merete_es_szegmensei():
    p = build_population(WORLD, streams(WORLD.seed)["population"])
    assert len(p.propensity) == WORLD.n_customers
    aranyok = np.bincount(p.segment_idx, minlength=4) / WORLD.n_customers
    vart = np.array([s.share for s in WORLD.segments])
    assert np.allclose(aranyok, vart, atol=0.01)


def test_a_populacio_reprodukalhato():
    a = build_population(WORLD, streams(WORLD.seed)["population"])
    b = build_population(WORLD, streams(WORLD.seed)["population"])
    assert np.array_equal(a.propensity, b.propensity)
    assert np.array_equal(a.churn_day, b.churn_day)


def test_az_affinitas_hat_dimenzios_es_pozitiv():
    p = build_population(WORLD, streams(WORLD.seed)["population"])
    assert p.affinity.shape == (WORLD.n_customers, 6)
    assert np.all(p.affinity > 0)


def test_a_koltes_alakja_es_elojele():
    s = build_spend(WORLD, streams(WORLD.seed)["spend"])
    assert s.shape == (WORLD.n_days, len(PAID_SLUGS))
    assert np.all(s >= 0)


def test_a_koltes_q4_ben_magasabb():
    s = build_spend(WORLD, streams(WORLD.seed)["spend"])
    napok = np.array([d.month for d in WORLD.days])
    q4 = s[(napok >= 11)].sum(axis=1).mean()
    nyar = s[(napok == 7)].sum(axis=1).mean()
    assert q4 > nyar * 1.15


def test_a_nullazott_csatorna_koltese_nulla_a_tobbi_valtozatlan():
    teljes = build_spend(WORLD, streams(WORLD.seed)["spend"])
    nelkule = build_spend(WORLD.zero_spend("meta_ads"), streams(WORLD.seed)["spend"])
    meta = PAID_SLUGS.index("meta_ads")
    assert np.all(nelkule[:, meta] == 0)
    tobbi = [i for i in range(3) if i != meta]
    assert np.array_equal(teljes[:, tobbi], nelkule[:, tobbi])


def test_a_szezonalitas_novemberben_magasabb_mint_juliusban():
    sz = seasonality(WORLD)
    honapok = np.array([d.month for d in WORLD.days])
    assert sz[honapok == 11].mean() > sz[honapok == 7].mean()


def test_a_black_friday_csak_az_utolso_penteken_van_2029_ben():
    # 2029 novemberében az elsejei péntekre 23-a ÉS 30-a is illeszkedik
    # (mindkettő péntek, 7 nap különbséggel) — ez az az év, amin egy
    # "d.day >= 23" határ tévesen mindkettőt kiválasztaná. A 2023-2025-ös
    # évek erre vakok, mert bennük a hónap utolsó péntekje sosem esik a 23-ára.
    cfg = replace(WORLD, start=date(2029, 1, 1), end=date(2029, 12, 31))
    sz = seasonality(cfg)
    napok = cfg.days
    november = np.array([d.month == 11 for d in napok])
    csucsok = sz[november] > 3.0  # a Black Friday-szorzó a többi napnál jóval magasabbra visz
    assert csucsok.sum() == 1
    utolso_pentek_indexe = [i for i, d in enumerate(napok) if d.month == 11 and d.day == 30][0]
    assert sz[utolso_pentek_indexe] > 3.0


from world.dgp import run


def test_a_vilag_lefut_es_minden_csatorna_szerepel(vilag):
    assert vilag.touches["channel"].max() == 5
    assert len(np.unique(vilag.touches["channel"])) == 6


def test_a_rendeles_es_a_session_nagysagrendje(vilag):
    n_session = len(vilag.touches["day"])
    n_rendeles = len(vilag.orders["day"])
    assert 900 * 1096 < n_session < 1300 * 1096
    assert 15_000 < n_rendeles < 25_000


def test_a_kosarertek_pozitiv_es_realis(vilag):
    ertek = vilag.orders["value_huf"]
    assert np.all(ertek > 0)
    assert 10_000 < float(np.median(ertek)) < 25_000


def test_a_lemorzsolodott_vasarlo_nem_kap_erintest(vilag):
    churn = vilag.population.churn_day[vilag.touches["customer"]]
    assert np.all(vilag.touches["day"] < churn)


def test_a_vilag_determinisztikus():
    a, b = run(WORLD), run(WORLD)
    assert np.array_equal(a.orders["value_huf"], b.orders["value_huf"])
    assert np.array_equal(a.touches["channel"], b.touches["channel"])


def test_a_rendeles_tudja_melyik_sessionbol_lett(vilag):
    t = vilag.orders["touch"]
    assert len(t) == len(vilag.orders["day"])
    assert len(np.unique(t)) == len(t)            # egy session legfeljebb egy rendelés
    assert np.array_equal(vilag.touches["customer"][t], vilag.orders["customer"])
    assert np.array_equal(vilag.touches["day"][t], vilag.orders["day"])


# --- elfogás (37. döntés) ---

CAPTURE_MAX = {"google_ads": 0.209, "meta_ads": 0.032, "arukereso": 0.072}


def elfogassal(cfg, **capture_max):
    """Ugyanaz a világ, csak a megadott capture_max értékekkel; a többi 0."""
    return replace(cfg, channels=tuple(
        replace(c, capture_max=capture_max.get(c.slug, 0.0)) for c in cfg.channels
    ))


ELFOGO = elfogassal(WORLD, **CAPTURE_MAX)


@pytest.fixture(scope="module")
def elfogo():
    return run(ELFOGO)


@pytest.fixture(scope="module")
def elfogas_nelkul():
    return run(elfogassal(WORLD))


def test_capture_max_nulla_mellett_nincs_elfogas(elfogas_nelkul):
    t = elfogas_nelkul.touches
    assert np.array_equal(t["channel"], t["base_channel"])


def test_van_elfogas_es_csak_organic_vagy_direct_foghato_el(elfogo):
    t = elfogo.touches
    elfogott = t["channel"] != t["base_channel"]
    assert elfogott.sum() > 0
    assert set(np.unique(t["base_channel"][elfogott])) == {3, 4}      # organic, direct
    assert set(np.unique(t["channel"][elfogott])) == {0, 1, 2}        # a három fizetett
    assert not elfogott[t["base_channel"] == 5].any()                 # email soha


def test_az_elfogas_nem_er_a_rendelesekhez(elfogo, elfogas_nelkul):
    for kulcs in ("customer", "day", "value_huf", "touch"):
        assert np.array_equal(elfogo.orders[kulcs], elfogas_nelkul.orders[kulcs]), kulcs
    for kulcs in ("customer", "day", "base_channel"):
        assert np.array_equal(elfogo.touches[kulcs], elfogas_nelkul.touches[kulcs]), kulcs


def test_a_session_szam_megmarad(elfogo, elfogas_nelkul):
    n = len(elfogo.touches["day"])
    assert int(elfogo.sessions_by_channel.sum()) == n
    assert int(elfogas_nelkul.sessions_by_channel.sum()) == n
    # naponta is: az elfogás csak csatornák között mozgat
    assert np.array_equal(elfogo.sessions_by_channel.sum(axis=1),
                          elfogas_nelkul.sessions_by_channel.sum(axis=1))
    # a számláló a megfigyelt címkéből jön
    assert np.array_equal(elfogo.sessions_by_channel.sum(axis=0),
                          np.bincount(elfogo.touches["channel"], minlength=6))


def test_az_elfogas_determinisztikus(elfogo):
    masodik = run(ELFOGO)
    for kulcs in ("channel", "base_channel"):
        assert np.array_equal(elfogo.touches[kulcs], masodik.touches[kulcs]), kulcs


@pytest.mark.parametrize("slug", PAID_SLUGS)
def test_a_nullazott_csatorna_nem_fog_el(slug):
    w = run(ELFOGO.zero_spend(slug))
    assert (w.touches["channel"] == PAID_SLUGS.index(slug)).sum() == 0


def test_nulla_koltesu_vilagban_nincs_elfogas():
    cfg = ELFOGO
    for slug in PAID_SLUGS:
        cfg = cfg.zero_spend(slug)
    t = run(cfg).touches
    assert np.array_equal(t["channel"], t["base_channel"])


def test_az_elfogas_a_koltessel_no(elfogo):
    """Az elfoghatók közül elfogottak aránya a legtöbbet költő negyedévben
    nagyobb, mint a legkevesebbet költőben."""
    negyedev = np.array([(d.year - WORLD.start.year) * 4 + (d.month - 1) // 3
                         for d in elfogo.days])
    koltes = np.bincount(negyedev, weights=elfogo.spend.sum(axis=1))
    t = elfogo.touches
    q = negyedev[t["day"]]
    elfoghato = np.isin(t["base_channel"], (3, 4))
    elfogott = t["channel"] != t["base_channel"]
    rata = np.bincount(q, weights=elfogott) / np.bincount(q, weights=elfoghato)
    assert rata[koltes.argmax()] > rata[koltes.argmin()]

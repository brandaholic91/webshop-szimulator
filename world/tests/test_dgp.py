from dataclasses import replace
from datetime import date

import numpy as np
import pytest
from world.config import WORLD, PAID_SLUGS
from world.rng import streams
from world.dgp import build_population, build_spend, seasonality


def nepesseg(seed=WORLD.seed):
    s = streams(seed)
    return build_population(WORLD, s["population"], s["lifetime"])


@pytest.fixture(scope="module")
def vilag():
    return run(WORLD)


def test_a_populacio_merete_es_szegmensei():
    p = nepesseg()
    assert len(p.propensity) == WORLD.n_customers
    aranyok = np.bincount(p.segment_idx, minlength=4) / WORLD.n_customers
    vart = np.array([s.share for s in WORLD.segments])
    assert np.allclose(aranyok, vart, atol=0.01)


def test_a_populacio_reprodukalhato():
    a = nepesseg()
    b = nepesseg()
    assert np.array_equal(a.propensity, b.propensity)
    assert np.array_equal(a.churn_day, b.churn_day)
    assert np.array_equal(a.arrival_day, b.arrival_day)


def test_az_affinitas_hat_dimenzios_es_pozitiv():
    p = nepesseg()
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


def test_a_szunetben_nincs_koltes_elotte_es_utana_van():
    s = build_spend(WORLD, streams(WORLD.seed)["spend"])
    for p in WORLD.pauses:
        j = PAID_SLUGS.index(p.slug)
        elso, utolso = (p.first - WORLD.start).days, (p.last - WORLD.start).days
        assert np.all(s[elso:utolso + 1, j] == 0), p
        assert s[elso - 1, j] > 0 and s[utolso + 1, j] > 0, p       # a szünet pontosan eddig tart
        tobbi = [i for i in range(3) if i != j]
        assert np.all(s[elso:utolso + 1, tobbi] > 0), p             # a másik kettő közben költ


def test_a_havi_szorzo_csatornankent_mas():
    """A v1-ben egy közös havi szorzó mozgatta mindhárom csatornát; most a havi költésük
    aránya hónapról hónapra változik."""
    s = build_spend(replace(WORLD, pauses=()), streams(WORLD.seed)["spend"])
    honap = np.array([d.year * 12 + d.month for d in WORLD.days])
    havi = np.array([s[honap == h].sum(axis=0) for h in np.unique(honap)])   # (36, 3)
    arany = havi[:, 0] / havi[:, 1]
    assert arany.std() / arany.mean() > 0.15


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


def test_erkezes_elott_es_lemorzsolodas_utan_nincs_erintes(vilag):
    c = vilag.touches["customer"]
    assert np.all(vilag.touches["day"] >= vilag.population.arrival_day[c])
    assert np.all(vilag.touches["day"] < vilag.population.churn_day[c])


def test_az_erkezes_es_a_lemorzsolodas_alakja():
    p = nepesseg()
    assert p.arrival_day.min() == 0 and p.arrival_day.max() < WORLD.n_days
    assert abs((p.arrival_day == 0).mean() - WORLD.initial_share) < 0.02
    # aki nem a nulladik napon van jelen, az a három év alatt egyenletesen érkezik
    kesobb = p.arrival_day[p.arrival_day > 0]
    assert abs(np.median(kesobb) - WORLD.n_days / 2) < 30
    # mindenki él legalább az érkezése napján, az utolsó napon érkező is
    assert np.all(p.churn_day > p.arrival_day)
    # a világ tudja, ki él még az ablak után
    assert (p.churn_day >= WORLD.n_days).any()


def test_az_aktivitas_az_affinitast_szorozza():
    p = nepesseg()
    assert p.activity.shape == (WORLD.n_customers,) and np.all(p.activity > 0)
    lapos = build_population(replace(WORLD, activity_sigma=0.0),
                             streams(WORLD.seed)["population"], streams(WORLD.seed)["lifetime"])
    assert np.all(lapos.activity == 1.0)
    assert np.allclose(p.affinity, lapos.affinity * p.activity[:, None])
    # az érkezés és az élettartam a sorsolás sorrendjében az aktivitás ELŐTT áll: nem mozdul
    assert np.array_equal(p.arrival_day, lapos.arrival_day)
    assert np.array_equal(p.churn_day, lapos.churn_day)


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


from world.dgp import _journey_strength


def _journey_strength_ciklussal(cfg, touches):
    """A _journey_strength eredeti, soronkénti alakja: lassú, de kézzel követhető.
    Csak referencia a vektoros változathoz."""
    ki = np.zeros(len(touches["day"]))
    utolsok: dict[int, list[int]] = {}
    for i in range(len(ki)):
        c, d = int(touches["customer"][i]), int(touches["day"][i])
        sor = utolsok.setdefault(c, [])
        while sor and sor[0] < d - cfg.lookback_days:
            sor.pop(0)
        sor.append(d)
        ki[i] = float(np.sqrt(len(sor)))
    return ki


def test_a_journey_ereje_kezzel_kiszamolva():
    """lookback 30 nap: az ablak a d − 30. napot még tartalmazza, a d − 31.-et már nem;
    az aznapi korábbi érintés számít, a másik vásárlóé nem."""
    touches = {"customer": np.array([7, 7, 3, 7, 7, 3]), "day": np.array([0, 0, 5, 30, 31, 40])}
    assert WORLD.lookback_days == 30
    assert _journey_strength(WORLD, touches) == pytest.approx(np.sqrt([1, 2, 1, 3, 2, 1]))


def test_a_journey_ereje_ures_erinteslistara_ures():
    ures = {"customer": np.array([], dtype=int), "day": np.array([], dtype=int)}
    assert _journey_strength(WORLD, ures).shape == (0,)


def test_a_journey_ereje_bitre_azonos_a_soronkenti_ciklussal(vilag):
    """A vektoros alak csak gyorsabb: a valódi világ minden érintésén ugyanazt adja.
    Ha ez bukik, a konverzió és vele minden commitolt out/ elmozdul."""
    assert np.array_equal(_journey_strength(WORLD, vilag.touches),
                          _journey_strength_ciklussal(WORLD, vilag.touches))


from world.dgp import _sorsol


@pytest.mark.parametrize("k", [1, 7, 5000])
def test_a_sorsolas_bitre_a_numpy_choice_es_a_stream_is_ugyanott_all(k):
    """A _sorsol a Generator.choice kézi alakja. Ha egy numpy-frissítés után ez bukik,
    a choice változott meg, nem a világ: a _sorsol marad, a teszt referenciája avul el."""
    rng = np.random.default_rng(3)
    suly = rng.random(30_000)
    suly[rng.random(30_000) < 0.3] = 0.0          # lemorzsolódott vásárlók: 0 súly
    p = suly / suly.sum()
    a, b = np.random.default_rng(11), np.random.default_rng(11)
    for _ in range(3):                             # egymás utáni hívások ugyanabból a streamből
        assert np.array_equal(_sorsol(a, p, k), b.choice(len(p), size=k, p=p))
    assert a.random() == b.random()

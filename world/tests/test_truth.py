from dataclasses import fields

import numpy as np
import pytest

from world.compare import load_truth
from world.config import WORLD, PAID_SLUGS
from world.dgp import build_population, run
from world.emit import customer_key
from world.rng import replica_streams, streams
from world.truth import (REPLICATES, build_truth, channel_audience, incrementality,
                         mean_incrementality, segment_assignment)


@pytest.fixture(scope="module")
def inc():
    csatornankent, _teljes_heti = incrementality(WORLD)
    return csatornankent


def test_a_populacio_bitre_azonos_a_nullazott_vilagban():
    """A 26. döntés magja. Ha ez bukik, MINDEN inkrementalitás-szám zaj —
    és semmi nem árulná el, mert az eredmény csak 'más' lenne, nem hibás."""
    teljes = run(WORLD)
    nelkule = run(WORLD.zero_spend("meta_ads"))
    for mezo in fields(teljes.population):
        assert np.array_equal(getattr(teljes.population, mezo.name),
                              getattr(nelkule.population, mezo.name)), mezo.name


def test_minden_fizetett_csatornara_van_igazsag(inc):
    assert set(inc) == set(PAID_SLUGS)


def test_az_inkrementalitas_pozitiv_es_kisebb_a_teljes_bevetelnel(inc):
    for slug, adat in inc.items():
        assert adat["incremental_revenue_huf"] > 0, slug
        assert adat["incremental_revenue_huf"] < adat["total_revenue_huf"], slug


def test_a_roas_realis(inc):
    for slug, adat in inc.items():
        assert 0.2 < adat["true_roas"] < 12.0, slug


def test_az_igazsag_a_replikak_atlaga():
    """Az 53. döntés: az igazság nem egy futás. Két replikán kézzel utánaszámolva."""
    atlag, heti = mean_incrementality(WORLD, replicates=2)
    egy, ketto = incrementality(WORLD, rep=1), incrementality(WORLD, rep=2)
    assert heti == pytest.approx(np.mean([egy[1], ketto[1]], axis=0))
    for slug in PAID_SLUGS:
        a, e, k = atlag[slug], egy[0][slug], ketto[0][slug]
        for kulcs in ("total_revenue_huf", "counterfactual_revenue_huf", "incremental_revenue_huf"):
            assert a[kulcs] == pytest.approx((e[kulcs] + k[kulcs]) / 2), (slug, kulcs)
        assert a["spend_huf"] == e["spend_huf"] == k["spend_huf"]
        # a fájlon belüli azonosságok az átlagon is állnak
        assert a["incremental_revenue_huf"] == pytest.approx(
            a["total_revenue_huf"] - a["counterfactual_revenue_huf"])
        assert a["share_of_revenue"] == pytest.approx(
            a["incremental_revenue_huf"] / a["total_revenue_huf"])
        assert a["true_roas"] == pytest.approx(a["incremental_revenue_huf"] / a["spend_huf"])


def test_a_truth_json_semaja():
    truth, megjelenites = build_truth(WORLD, replicates=1)
    assert truth["replicates"] == 1
    assert truth["schema_version"] == 1
    assert set(truth) >= {
        "schema_version", "seed", "adstock", "saturation",
        "base_demand", "segments", "segment_assignment", "incrementality",
    }
    # A 27. döntés (a): a CLV és az uplift MÉG NINCS benne.
    assert "clv" not in truth and "uplift" not in truth
    assert len(truth["segment_assignment"]) == WORLD.n_customers
    # A megjelenítési dict nem tartalmaz vásárló-szintű latenst.
    assert "segment_idx" not in megjelenites and "segment_assignment" not in megjelenites


def test_az_elfogas_nem_mozditja_az_igazsagot():
    """Az elfogás csak session-címkét ír át (37. döntés), tehát az újraszámolt
    igazság a commitolt truth.json-nal egyezik. Ha ez bukik, valami csatornát
    olvas a konverzióban vagy a rendelésben, és minden commitolt out/ érvénytelen.

    A készlet leglassabb tesztje: mind a REPLICATES replikát újrafuttatja."""
    truth = load_truth()
    assert truth["replicates"] == REPLICATES
    assert build_truth(WORLD)[0] == truth


def test_a_szegmens_kiosztas_a_populacio_cimkeje_customer_key_szerint():
    """57. döntés: a segments igazsága vásárlónként egy slug, a pipeline kulcsával."""
    kiosztas = segment_assignment(WORLD)
    pop = build_population(WORLD, streams(WORLD.seed)["population"], streams(WORLD.seed)["lifetime"])
    slugok = [s.slug for s in WORLD.segments]
    assert len(kiosztas) == WORLD.n_customers
    assert set(kiosztas.values()) == set(slugok)
    for i in (0, 1, 12_345, WORLD.n_customers - 1):
        assert kiosztas[customer_key(WORLD.seed, i)] == slugok[pop.segment_idx[i]]


def test_a_nepesseg_minden_replikaban_ugyanaz():
    """A population és a lifetime stream nincs a VALTOZO-ban (rng.py): a 40 újrajátszás
    ugyanazt a vevőkört játssza újra, ugyanazzal az érkezéssel és lemorzsolódással."""
    s, r = streams(WORLD.seed), replica_streams(WORLD.seed, 7)
    alap = build_population(WORLD, s["population"], s["lifetime"])
    replika = build_population(WORLD, r["population"], r["lifetime"])
    for mezo in fields(alap):
        assert np.array_equal(getattr(alap, mezo.name), getattr(replika, mezo.name)), mezo.name


def test_a_csatorna_kozonsege_a_sajat_sessionjeibol_jon():
    """A lap ebből magyarázza a csatornák eltérő megtérülését: a session-szám a
    csatorna saját (elfogás előtti) sessionje, a közönség ezek szegmens-aránya."""
    w = run(WORLD)
    ki = channel_audience(WORLD, w)
    assert list(ki) == list(PAID_SLUGS)
    for j, s in enumerate(PAID_SLUGS):
        assert ki[s]["paid_sessions"] == int((w.touches["base_channel"] == j).sum()) > 0
        assert len(ki[s]["audience"]) == len(WORLD.segments)
        assert sum(ki[s]["audience"]) == pytest.approx(1.0)
    # Az affinitás a közönségben is látszik: minden csatornát az a típus uralja,
    # amelyiknek a legnagyobb rá az affinitása (a cfg.segments sorrendjében).
    for j, s in enumerate(PAID_SLUGS):
        kedvenc = int(np.argmax([seg.affinity[j] * seg.share for seg in WORLD.segments]))
        assert int(np.argmax(ki[s]["audience"])) == kedvenc, s

import numpy as np
import pytest

from world.compare import load_truth
from world.config import WORLD, PAID_SLUGS
from world.dgp import run
from world.truth import build_truth, incrementality


@pytest.fixture(scope="module")
def inc():
    csatornankent, _teljes_heti = incrementality(WORLD)
    return csatornankent


def test_a_populacio_bitre_azonos_a_nullazott_vilagban():
    """A 26. döntés magja. Ha ez bukik, MINDEN inkrementalitás-szám zaj —
    és semmi nem árulná el, mert az eredmény csak 'más' lenne, nem hibás."""
    teljes = run(WORLD)
    nelkule = run(WORLD.zero_spend("meta_ads"))
    assert np.array_equal(teljes.population.propensity, nelkule.population.propensity)
    assert np.array_equal(teljes.population.segment_idx, nelkule.population.segment_idx)
    assert np.array_equal(teljes.population.churn_day, nelkule.population.churn_day)


def test_minden_fizetett_csatornara_van_igazsag(inc):
    assert set(inc) == set(PAID_SLUGS)


def test_az_inkrementalitas_pozitiv_es_kisebb_a_teljes_bevetelnel(inc):
    for slug, adat in inc.items():
        assert adat["incremental_revenue_huf"] > 0, slug
        assert adat["incremental_revenue_huf"] < adat["total_revenue_huf"], slug


def test_a_roas_realis(inc):
    for slug, adat in inc.items():
        assert 0.2 < adat["true_roas"] < 12.0, slug


def test_a_truth_json_semaja():
    truth, megjelenites = build_truth(WORLD)
    assert truth["schema_version"] == 1
    assert set(truth) >= {
        "schema_version", "seed", "adstock", "saturation",
        "base_demand", "segments", "incrementality",
    }
    # A 27. döntés (a): a CLV és az uplift MÉG NINCS benne.
    assert "clv" not in truth and "uplift" not in truth
    # A megjelenítési dict nem tartalmaz vásárló-szintű latenst.
    assert "segment_idx" not in megjelenites


def test_az_elfogas_nem_mozditja_az_igazsagot():
    """Az elfogás csak session-címkét ír át (37. döntés), tehát az újraszámolt
    igazság a commitolt truth.json-nal egyezik. Ha ez bukik, valami csatornát
    olvas a konverzióban vagy a rendelésben, és minden commitolt out/ érvénytelen."""
    assert build_truth(WORLD)[0] == load_truth()

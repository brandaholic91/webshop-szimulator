import dataclasses
import pytest
from datetime import date
from world.config import WORLD, PAID_SLUGS, ALL_SLUGS


def test_a_naprács_1096_nap():
    assert WORLD.n_days == 1096
    assert WORLD.days[0] == date(2023, 1, 1)
    assert WORLD.days[-1] == date(2025, 12, 31)
    assert WORLD.n_days // 7 >= 156


def test_hat_csatorna_harom_fizetett():
    assert len(ALL_SLUGS) == 6
    assert PAID_SLUGS == ("google_ads", "meta_ads", "arukereso")
    assert ALL_SLUGS[:3] == PAID_SLUGS


def test_a_szegmens_arányok_egyet_adnak():
    assert sum(s.share for s in WORLD.segments) == pytest.approx(1.0)
    assert len(WORLD.segments) == 4


def test_a_config_fagyasztott():
    with pytest.raises(dataclasses.FrozenInstanceError):
        WORLD.seed = 1


def test_zero_spend_csak_egy_csatornat_nulláz():
    w = WORLD.zero_spend("meta_ads")
    assert w.channel("meta_ads").daily_base_huf == 0.0
    assert w.channel("google_ads").daily_base_huf == WORLD.channel("google_ads").daily_base_huf
    assert WORLD.channel("meta_ads").daily_base_huf > 0.0  # az eredeti érintetlen


def test_zero_spend_csak_fizetett_csatornara_ertelmes():
    with pytest.raises(ValueError):
        WORLD.zero_spend("organic")


def test_csak_fizetett_csatorna_fog_el_es_a_savok_elfernek():
    for c in WORLD.channels:
        if c.kind == "unpaid":
            assert c.capture_max == 0.0, c.slug
        assert 0.0 <= c.capture_max <= 1.0, c.slug
    # a három sáv egymás után áll a [0, 1) intervallumban
    assert sum(c.capture_max for c in WORLD.channels) <= 1.0

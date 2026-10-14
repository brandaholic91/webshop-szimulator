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


def test_a_kampanyszunetek_ervenyesek_es_nem_fedik_egymast():
    """Kézzel felsorolt szünetek (58. döntés): fizetett csatorna, az ablakon belül, 2–4 hét,
    és soha nem egy időben, különben a csatornák hatása megint nem volna szétválasztható.
    Az ablak első és utolsó napja nem lehet szünet: előtte és utána is kell költéses nap."""
    assert 3 <= len(WORLD.pauses) <= 6
    for p in WORLD.pauses:
        assert p.slug in PAID_SLUGS, p
        assert WORLD.start < p.first <= p.last < WORLD.end, p
        assert 14 <= (p.last - p.first).days + 1 <= 28, p
    for i, a in enumerate(WORLD.pauses):
        for b in WORLD.pauses[i + 1:]:
            assert a.last < b.first or b.last < a.first, (a, b)
    assert {p.slug for p in WORLD.pauses} == set(PAID_SLUGS)   # mindegyiknek van legalább egy

import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from world.journeys import Path, Session, build_paths, to_sessions

T0 = datetime(2023, 3, 1, 12, tzinfo=timezone.utc)


def s(person, nap, channel, value=None):
    return Session(person, T0 + timedelta(days=nap), channel, value)


def test_a_sorokbol_session_lesz_csatorna_sluggal():
    sorok = [("p1", T0, "google / cpc", None),
             ("p1", T0 + timedelta(days=1), "direct / none", Decimal("12500"))]
    assert to_sessions(sorok) == [
        Session("p1", T0, "google_ads", None),
        Session("p1", T0 + timedelta(days=1), "direct", 12500),
    ]
    assert type(to_sessions(sorok)[1].value_huf) is int


@pytest.mark.parametrize("forras", ["bing / cpc", None])
def test_ismeretlen_forras_hiba_nem_nema_eldobas(forras):
    with pytest.raises(ValueError, match="ismeretlen source_medium"):
        to_sessions([("p1", T0, forras, None)])


def test_az_ablak_hatara_beleszamit_a_regebbi_kimarad():
    sessions = [s("p", 0, "organic"), s("p", 23, "meta_ads"), s("p", 30, "google_ads", 1000)]
    assert build_paths(sessions, 7) == [
        Path(("organic",), (0.0,), None),
        Path(("meta_ads", "google_ads"), (7.0, 0.0), 1000),
    ]
    assert build_paths(sessions, 30) == [
        Path(("organic", "meta_ads", "google_ads"), (30.0, 7.0, 0.0), 1000),
    ]


def test_vasarlas_utan_uj_utvonal_kezdodik():
    sessions = [s("p", 1, "direct", 500), s("p", 2, "email"), s("p", 3, "google_ads", 700)]
    assert build_paths(sessions, 30) == [
        Path(("direct",), (0.0,), 500),
        Path(("email", "google_ads"), (1.0, 0.0), 700),
    ]


def test_nem_konvertalo_utvonal_az_ablaknal_hosszabb_szunetnel_vagodik():
    sessions = [s("p", 0, "organic"), s("p", 5, "direct"), s("p", 20, "email"), s("p", 21, "email")]
    assert build_paths(sessions, 7) == [
        Path(("organic", "direct"), (5.0, 0.0), None),
        Path(("email", "email"), (1.0, 0.0), None),
    ]
    assert build_paths(sessions, 30) == [
        Path(("organic", "direct", "email", "email"), (21.0, 16.0, 1.0, 0.0), None),
    ]


def test_a_vasarlas_utani_session_kulon_nem_konvertalo_utvonal():
    sessions = [s("p", 0, "organic"), s("p", 2, "google_ads", 900), s("p", 3, "direct")]
    assert build_paths(sessions, 30) == [
        Path(("organic", "google_ads"), (2.0, 0.0), 900),
        Path(("direct",), (0.0,), None),
    ]


def test_az_utvonal_nem_lep_at_szemelyek_kozott():
    sessions = [s("a", 0, "organic"), s("b", 1, "google_ads", 800)]
    assert build_paths(sessions, 30) == [
        Path(("organic",), (0.0,), None),
        Path(("google_ads",), (0.0,), 800),
    ]


def test_az_egymas_utani_azonos_csatornak_megmaradnak():
    sessions = [s("p", 0, "email"), s("p", 1, "email"), s("p", 2, "email", 600)]
    assert build_paths(sessions, 30) == [Path(("email", "email", "email"), (2.0, 1.0, 0.0), 600)]


@pytest.mark.parametrize("ablak", [7, 14, 30, 90])
def test_minden_rendeles_pontosan_egy_konvertalo_utvonalban_van(ablak):
    """A spec 2.2 következménye: a konvertáló útvonalak összbevétele bármely
    ablak mellett a teljes bevétel, és egyetlen session sem vész el."""
    rng = random.Random(7)
    csatornak = ["google_ads", "meta_ads", "arukereso", "organic", "direct", "email"]
    sessions = []
    for p in range(300):
        napok = sorted(rng.uniform(0, 400) for _ in range(rng.randint(1, 12)))
        for nap in napok:
            ertek = rng.randint(3_000, 60_000) if rng.random() < 0.15 else None
            sessions.append(s(f"p{p:03d}", nap, rng.choice(csatornak), ertek))
    rendelesek = [x.value_huf for x in sessions if x.value_huf is not None]

    utak = build_paths(sessions, ablak)
    konvertalo = [u for u in utak if u.value_huf is not None]
    assert len(konvertalo) == len(rendelesek)
    assert sum(u.value_huf for u in konvertalo) == sum(rendelesek)
    assert sum(len(u.channels) for u in utak) == len(sessions)
    assert all(d <= ablak for u in konvertalo for d in u.days)
    assert all(u.days[-1] == 0.0 for u in utak)

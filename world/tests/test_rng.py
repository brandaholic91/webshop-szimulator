import numpy as np
from world.rng import LAYERS, streams


def test_a_retegek_sorrendje_rogzitett():
    # A 26. döntés: csak a VÉGÉRE szabad új réteget fűzni. Ez a teszt őrzi.
    assert LAYERS == (
        "population", "spend", "touch", "conversion", "orders", "lifetime", "emit", "capture",
    )


def test_ugyanaz_a_seed_ugyanaz_a_sorsolas():
    a = streams(42)["population"].normal(size=5)
    b = streams(42)["population"].normal(size=5)
    assert np.array_equal(a, b)


def test_a_retegek_fuggetlenek():
    s = streams(42)
    a = s["population"].normal(size=1000)
    b = s["spend"].normal(size=1000)
    assert abs(float(np.corrcoef(a, b)[0, 1])) < 0.1


def test_egy_reteg_kimeritese_nem_mozditja_a_tobbit():
    """Ez a determinizmus-ígéret magja: ha a 'spend' streamből többet húzunk
    (mert egy csatorna nullán van), a 'population' stream bitre azonos marad."""
    a = streams(42)
    a["spend"].normal(size=10_000)
    hasznalt = a["population"].normal(size=5)

    b = streams(42)
    erintetlen = b["population"].normal(size=5)

    assert np.array_equal(hasznalt, erintetlen)


def test_uj_reteg_a_vegen_nem_mozditja_a_korabbiakat():
    """Az "emit" réteg hozzáfűzése után a hat régi stream bitre ugyanaz, mint
    amikor még csak hat volt. Ha ez bukik, minden commitolt out/ érvénytelen."""
    regi = np.random.SeedSequence(42).spawn(6)
    uj = streams(42)
    for nev, mag in zip(LAYERS[:6], regi):
        assert np.array_equal(np.random.default_rng(mag).normal(size=5),
                              uj[nev].normal(size=5)), nev


def test_a_capture_reteg_a_vegen_nem_mozditja_a_korabbiakat():
    """Ugyanaz az őr, a nyolcadik rétegre: a hét régi stream bitre ugyanaz,
    mint amikor a "capture" még nem létezett."""
    regi = np.random.SeedSequence(42).spawn(7)
    uj = streams(42)
    for nev, mag in zip(LAYERS[:7], regi):
        assert np.array_equal(np.random.default_rng(mag).normal(size=5),
                              uj[nev].normal(size=5)), nev

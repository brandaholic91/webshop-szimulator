"""A 25. döntés kalibrációs céljai. Ez fogja el a hangolás közbeni elcsúszást:
ha valaki a config.py-hoz nyúl, itt derül ki, hogy kiesett a világ a sávból."""
import pytest

from world.config import WORLD
from world.dgp import run
from world.report import metrics

SAVOK = {
    "session_per_nap": (950, 1150),
    "konverzios_rata": (0.015, 0.021),
    "rendeles": (18_000, 22_000),
    "aov_huf": (16_000, 20_000),
    "visszatero_arany": (0.25, 0.35),
    "koltes_bevetel_arany": (0.09, 0.13),
    "fizetett_session_arany": (0.40, 0.46),
    "elfogott_arany_google_ads": (0.27, 0.33),
    "elfogott_arany_meta_ads": (0.06, 0.10),
    "elfogott_arany_arukereso": (0.22, 0.28),
}


@pytest.fixture(scope="module")
def m():
    return metrics(run(WORLD))


@pytest.mark.parametrize("kulcs", list(SAVOK))
def test_a_celsavban(m, kulcs):
    also, felso = SAVOK[kulcs]
    assert also <= m[kulcs] <= felso, f"{kulcs} = {m[kulcs]:,.4f}, sáv: {also}–{felso}"


@pytest.fixture(scope="module")
def vilag():
    return run(WORLD)


def test_a_konverzios_rata_nem_sodrodik_el_evek_alatt(vilag):
    """A napi session-szám Poisson-várhatóértéke NEM függ attól, hány vásárló él
    még, a populáció viszont lemorzsolódik és sehol nincs utánpótlás. Ha a
    lemorzsolódás túl gyors, ugyanaz a napi forgalom egyre szűkülő túlélő-körre
    koncentrálódik, a `_journey_strength` felkúszik, és a konverziós ráta a
    marketingtől függetlenül emelkedik. A műszer heti bevétel-grafikonján ez
    hamis trendként jelenne meg: a tényleges és az ellentényes görbe közti rést
    hirdetési inkrementalitásként olvasnánk, holott populáció-kimerülés.

    A `churn_hazard_daily`-k hangolása tartja ezt kordában — ez a teszt a kapu.
    """
    nap = vilag.touches["day"]
    rendeles_nap = vilag.orders["day"]
    n = len(vilag.days)

    def rata(also, felso):
        s = int(((nap >= also) & (nap <= felso)).sum())
        r = int(((rendeles_nap >= also) & (rendeles_nap <= felso)).sum())
        return r / s

    elso_ev = rata(0, 364)
    utolso_ev = rata(n - 365, n - 1)

    assert utolso_ev <= 1.5 * elso_ev, (
        f"CR-sodródás: első év {elso_ev:.4%}, utolsó év {utolso_ev:.4%}, "
        f"arány {utolso_ev / elso_ev:.2f}×"
    )


def test_a_session_szamlalo_es_az_erintesek_szama_egyezik(vilag):
    # A sessions_by_channel a touches megfigyelt címkéjéből számolódik (37. döntés), tehát
    # a két szám szerkezetileg egyezik: a tíz sáv ugyanazon a nevezőn mérődik akkor is, ha
    # a run() egy csatorna/nap párnál érintés nélkül `continue`-zik.
    assert int(vilag.sessions_by_channel.sum()) == len(vilag.touches["day"])

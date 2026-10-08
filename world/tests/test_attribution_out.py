"""A commitolt out/attribution.json őrei. Számot szándékosan NEM rögzítenek:
az összefüggéseket nézik, amiknek a világ újragyártása után is állniuk kell."""
import json

import pytest

from world.attribution import DEFAULT_WINDOW, MODELS, WINDOWS
from world.compare import attribution_truth
from world.config import ALL_SLUGS, PAID_SLUGS
from world.truth import OUT


@pytest.fixture(scope="module")
def adat():
    return json.loads((OUT / "attribution.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ledger():
    return json.loads((OUT / "events_ledger.json").read_text(encoding="utf-8"))


def test_a_fajl_fejlece(adat):
    assert adat["schema_version"] == 1
    assert adat["windows"] == list(WINDOWS) and adat["default_window"] == DEFAULT_WINDOW
    assert adat["channels"] == list(ALL_SLUGS) and adat["paid"] == list(PAID_SLUGS)
    assert adat["models"] == list(MODELS)
    assert list(adat["by_window"]) == [str(w) for w in WINDOWS]


def test_a_bevetelek_a_fokonyvbol_jonnek(adat, ledger):
    assert adat["pipeline_revenue_huf"] == ledger["revenue_huf"]["pipeline"]
    assert adat["total_revenue_huf"] == ledger["revenue_huf"]["dgp"]


def test_az_igazsag_a_commitolt_igazsag(adat):
    assert adat["truth"] == attribution_truth()


def test_minden_modell_a_teljes_bevetelt_osztja_szet_minden_ablakban(adat):
    for w, ablak in adat["by_window"].items():
        for modell in adat["models"]:
            assert len(ablak["share"][modell]) == 6 and len(ablak["roas"][modell]) == 3
            assert sum(ablak["share"][modell]) == pytest.approx(1.0), (w, modell)


def test_minden_rendeleshez_egy_konvertalo_utvonal_tartozik_minden_ablakban(adat, ledger):
    for w, ablak in adat["by_window"].items():
        assert ablak["paths"]["converting"] == ledger["orders"]["pipeline"], w
    # hosszabb ablak -> több session fér egy útvonalba -> kevesebb nem konvertáló útvonal
    nem = [adat["by_window"][str(w)]["paths"]["non_converting"] for w in WINDOWS]
    assert nem == sorted(nem, reverse=True)


def test_a_last_click_nem_fugg_az_ablaktol(adat):
    """Az utolsó session mindig a vásárló session. Az oldal ki is mondja."""
    elso = adat["by_window"][str(WINDOWS[0])]["share"]["last_click"]
    for w in WINDOWS[1:]:
        assert adat["by_window"][str(w)]["share"]["last_click"] == pytest.approx(elso), w

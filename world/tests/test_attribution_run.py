import json
from datetime import datetime, timedelta, timezone

import pytest

import world.attribution as attribution
from world.attribution import DEFAULT_WINDOW, MODELS, WINDOWS, assemble, check, estimate
from world.config import ALL_SLUGS, PAID_SLUGS
from world.journeys import Session

T0 = datetime(2023, 3, 1, 12, tzinfo=timezone.utc)


def s(person, nap, channel, value=None):
    return Session(person, T0 + timedelta(days=nap), channel, value)


SESSIONS = [
    s("a", 0, "meta_ads"), s("a", 10, "organic"), s("a", 12, "google_ads", 6000),
    s("b", 3, "arukereso", 3000),
    s("c", 1, "direct"), s("c", 50, "email"),
    s("d", 5, "google_ads"), s("d", 6, "direct", 1000),
]
LEDGER = {
    "sessions": {"dgp": 10, "pipeline": 8},
    "orders": {"dgp": 4, "pipeline": 3},
    "revenue_huf": {"dgp": 12_500, "pipeline": 10_000},
}
SPEND = {"start": "2023-01-01", "channels": list(PAID_SLUGS),
         "daily_huf": [[1000, 1000], [500, 500], [250, 250]]}
TRUTH = {
    "google_ads": {"share": 0.30, "roas": 2.0},
    "meta_ads": {"share": 0.20, "roas": 3.0},
    "arukereso": {"share": 0.10, "roas": 1.5},
}


def test_egyezo_db_nel_nincs_hiba():
    assert check(SESSIONS, LEDGER) == []


@pytest.mark.parametrize("kulcs, ertek, szoveg", [
    ("sessions", 9, "session"),
    ("orders", 4, "rendelés darab"),
    ("revenue_huf", 10_001, "rendelés érték"),
])
def test_minden_elteres_megnevezett_hiba(kulcs, ertek, szoveg):
    ledger = {**LEDGER, kulcs: {**LEDGER[kulcs], "pipeline": ertek}}
    hibak = check(SESSIONS, ledger)
    assert len(hibak) == 1 and hibak[0].startswith(szoveg), hibak


def test_a_becsles_minden_ablakra_es_minden_modellre_megvan():
    becslesek = estimate(SESSIONS)
    assert list(becslesek) == list(WINDOWS)
    for w, b in becslesek.items():
        assert b["paths"]["converting"] == 3, w
        assert list(b["revenue"]) == list(MODELS)
        for modell, bevetel in b["revenue"].items():
            assert sum(bevetel.values()) == pytest.approx(10_000), (w, modell)
    # 7 napos ablakban a 12 nappal korábbi Meta-session kimarad, 30 naposban benne van
    assert "meta_ads" not in becslesek[7]["revenue"]["linear"]
    assert becslesek[30]["revenue"]["linear"]["meta_ads"] == pytest.approx(2000)
    assert becslesek[7]["paths"]["non_converting"] == 3
    assert becslesek[90]["paths"]["non_converting"] == 1


def test_a_kimenet_alakja_a_spec_szerinti():
    adat = assemble(estimate(SESSIONS), LEDGER, SPEND, TRUTH)
    assert adat["schema_version"] == 1
    assert adat["windows"] == [7, 14, 30, 90] and adat["default_window"] == DEFAULT_WINDOW == 30
    assert adat["channels"] == list(ALL_SLUGS) and adat["paid"] == list(PAID_SLUGS)
    assert adat["models"] == ["last_click", "linear", "time_decay", "markov"]
    assert adat["total_revenue_huf"] == 12_500 and adat["pipeline_revenue_huf"] == 10_000
    assert adat["truth"] == TRUTH
    assert list(adat["by_window"]) == ["7", "14", "30", "90"]
    for ablak in adat["by_window"].values():
        assert set(ablak) == {"paths", "share", "roas", "mean_abs_error_pp"}
        for modell in adat["models"]:
            assert len(ablak["share"][modell]) == 6
            assert len(ablak["roas"][modell]) == 3
            assert sum(ablak["share"][modell]) == pytest.approx(1.0)
            assert ablak["mean_abs_error_pp"][modell] >= 0
    # last-click, Google: 6000 / 10 000 = 0,6;  ROAS = 0,6 × 12 500 / 2000 = 3,75
    lc = adat["by_window"]["30"]
    assert lc["share"]["last_click"][0] == pytest.approx(0.6)
    assert lc["roas"]["last_click"][0] == pytest.approx(3.75)
    json.dumps(adat)   # sorosítható, nincs benne numpy-típus


class Conn:
    read_only = False
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _kornyezet(monkeypatch, tmp_path, ledger):
    (tmp_path / "events_ledger.json").write_text(json.dumps(ledger), encoding="utf-8")
    (tmp_path / "world_spend.json").write_text(json.dumps(SPEND), encoding="utf-8")
    monkeypatch.setattr(attribution, "OUT", tmp_path)
    monkeypatch.setattr(attribution.psycopg, "connect", lambda *a, **k: Conn())
    monkeypatch.setattr(attribution, "fetch_sessions", lambda conn: SESSIONS)
    monkeypatch.setattr(attribution, "attribution_truth", lambda: TRUTH)


def test_ha_a_db_nem_egyezik_a_fokonyvvel_nem_ir_fajlt(monkeypatch, tmp_path):
    rossz = {**LEDGER, "orders": {"dgp": 4, "pipeline": 99}}
    _kornyezet(monkeypatch, tmp_path, rossz)
    with pytest.raises(SystemExit, match="NEM írok fájlt"):
        attribution.main()
    assert not (tmp_path / "attribution.json").exists()


def test_egyezo_db_nel_megirja_a_fajlt(monkeypatch, tmp_path):
    _kornyezet(monkeypatch, tmp_path, LEDGER)
    attribution.main()
    adat = json.loads((tmp_path / "attribution.json").read_text(encoding="utf-8"))
    assert adat["schema_version"] == 1 and adat["truth"] == TRUTH


def test_nem_helyi_db_re_lekerdezes_nelkul_all_meg(monkeypatch, tmp_path):
    hivasok = []
    monkeypatch.setattr(attribution, "DB_URL", "postgresql://u:p@db.prod.example:5432/fpcollector")
    monkeypatch.setattr(attribution, "OUT", tmp_path)
    monkeypatch.setattr(attribution.psycopg, "connect", lambda *a, **k: hivasok.append("connect"))
    with pytest.raises(ValueError, match="csak helyi"):
        attribution.main()
    assert hivasok == []

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

import pytest

import world.export as export
from world.config import ALL_SLUGS, WORLD
from world.emit import SOURCE_MEDIUM
from world.export import _json_default, build_ledger, check, daily_grid
from world.load import config_for

EMIT_OK = {
    "events_generated": 1000, "events_withheld_no_consent": 200,
    "events_sent_unique": 800, "events_sent_duplicate": 8,
    "sessions": 200, "sessions_consented": 160,
    "orders": 10, "orders_consented": 8,
    "revenue_huf": 180_000, "revenue_consented_huf": 144_000,
    "customers": 150, "customers_consented": 125, "devices": 190, "devices_consented": 152,
}
PIPE_OK = {
    "raw_events": 800, "unprocessed": 0, "failed": 0, "clean_events": 800,
    "sessions": 160, "devices": 152, "persons": 151, "orders": 8,
    "revenue_huf": 144_000, "identity_links": 8, "customers_identified": 7,
}


def test_ha_minden_stimmel_nincs_hiba():
    assert check(EMIT_OK, PIPE_OK) == []


@pytest.mark.parametrize("kulcs, ertek, szoveg", [
    ("raw_events", 799, "raw_events vs. elküldött"),      # elveszett esemény
    ("raw_events", 801, "raw_events vs. elküldött"),      # idegen sor a DB-ben
    ("unprocessed", 3, "feldolgozatlan"),
    ("failed", 1, "processing_error"),
    ("clean_events", 790, "clean_events vs. raw_events"),
    ("sessions", 159, "session"),
    ("orders", 7, "orders darab"),
    ("revenue_huf", 143_999, "orders érték"),
])
def test_minden_elteres_megnevezett_hiba(kulcs, ertek, szoveg):
    hibak = check(EMIT_OK, {**PIPE_OK, kulcs: ertek})
    assert any(szoveg in h for h in hibak), hibak


def test_ures_db_hiba():
    ures = {k: 0 for k in PIPE_OK}
    assert check(EMIT_OK, ures)


def test_a_fokonyv_a_ket_oldalt_egymas_melle_teszi():
    f = build_ledger(EMIT_OK, PIPE_OK)
    assert f["events"] == {"generated": 1000, "withheld_no_consent": 200,
                           "sent_unique": 800, "sent_duplicate": 8,
                           "raw_events": 800, "clean_events": 800}
    assert f["sessions"] == {"dgp": 200, "pipeline": 160}
    assert f["orders"] == {"dgp": 10, "pipeline": 8}
    assert f["revenue_huf"] == {"dgp": 180_000, "pipeline": 144_000}
    assert f["identity"]["devices_pipeline"] == 152
    assert f["identity"]["persons_after_stitching"] == 151


def test_a_napi_racs_alakja():
    cfg = config_for(3)
    sess = [{"nap": date(2023, 1, 1), "source_medium": "google / cpc", "sessions": 5},
            {"nap": date(2023, 1, 3), "source_medium": "direct / none", "sessions": 2}]
    rend = [{"nap": date(2023, 1, 3), "source_medium": "direct / none",
             "orders": 1, "revenue_huf": Decimal("12500")}]
    d = daily_grid(cfg, sess, rend)
    assert d["start"] == "2023-01-01"
    assert d["channels"] == list(ALL_SLUGS)
    for kulcs in ("sessions", "orders", "revenue_huf"):
        assert len(d[kulcs]) == 6 and all(len(sor) == 3 for sor in d[kulcs])
    assert d["sessions"][ALL_SLUGS.index("google_ads")] == [5, 0, 0]
    assert d["sessions"][ALL_SLUGS.index("direct")] == [0, 0, 2]
    assert d["orders"][ALL_SLUGS.index("direct")] == [0, 0, 1]
    assert d["revenue_huf"][ALL_SLUGS.index("direct")] == [0, 0, 12500]
    assert type(d["revenue_huf"][0][0]) is int


def test_minden_csatornanak_van_source_medium_parja():
    assert set(SOURCE_MEDIUM) == set(ALL_SLUGS)
    assert len(set(SOURCE_MEDIUM.values())) == 6


def test_ismeretlen_forras_hiba_nem_nema_eldobas():
    with pytest.raises(ValueError, match="ismeretlen source_medium"):
        daily_grid(config_for(3), [{"nap": date(2023, 1, 1),
                                    "source_medium": "bing / cpc", "sessions": 1}], [])


@pytest.mark.parametrize("nap", [date(2022, 12, 31), date(2023, 1, 4)])
def test_idoszakon_kivuli_nap_hiba(nap):
    with pytest.raises(ValueError, match="időszakán kívüli"):
        daily_grid(config_for(3), [{"nap": nap, "source_medium": "direct / none",
                                    "sessions": 1}], [])


def test_json_tipusok():
    assert _json_default(datetime(2023, 1, 1, 12, tzinfo=timezone.utc)) == "2023-01-01T12:00:00+00:00"
    assert _json_default(UUID("6f1c2a54-0d0b-4b7e-9a51-3f2a7c1e8d10")) == "6f1c2a54-0d0b-4b7e-9a51-3f2a7c1e8d10"
    assert _json_default(Decimal("12500")) == 12500
    assert _json_default(Decimal("0.5")) == 0.5
    with pytest.raises(TypeError):
        _json_default(object())


def test_az_export_nem_helyi_db_re_lekerdezes_nelkul_all_meg(monkeypatch):
    hivasok = []
    monkeypatch.setattr(export, "DB_URL", "postgresql://u:p@db.prod.example:5432/fpcollector")
    monkeypatch.setattr(export, "run", lambda cfg: hivasok.append("run"))
    monkeypatch.setattr(export.psycopg, "connect", lambda *a, **k: hivasok.append("connect"))
    monkeypatch.setattr("sys.argv", ["export"])
    with pytest.raises(ValueError, match="csak helyi"):
        export.main()
    assert hivasok == []


def test_hibas_pipeline_eseten_nem_ir_fajlt(monkeypatch, tmp_path):
    class Conn:
        read_only = False
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(export, "OUT", tmp_path)
    monkeypatch.setattr(export, "config_for", lambda days: config_for(5))
    monkeypatch.setattr(export.psycopg, "connect", lambda *a, **k: Conn())
    monkeypatch.setattr(export, "pipeline_counts", lambda conn: {k: 0 for k in PIPE_OK})
    monkeypatch.setattr("sys.argv", ["export"])
    with pytest.raises(SystemExit, match="NEM írok fájlt"):
        export.main()
    assert list(tmp_path.iterdir()) == []

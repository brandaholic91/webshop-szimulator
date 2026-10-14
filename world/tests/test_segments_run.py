import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

import world.segments as segments
from world.compare import SEGMENTS
from world.customers import FEATURES, VALUE_FEATURES, Customer, build_features, select
from world.segments import FEATURE_SETS, KS, SEED, assemble, check, estimate, profile

T0 = datetime(2024, 1, 1, 12, tzinfo=timezone.utc)
T = lambda nap: T0 + timedelta(days=nap)


def vevo(i, csoport):
    """Két jól elváló csoport, csoporton belül is különböző sorok (a k-means++ miatt)."""
    if csoport == "a":   # egyszer vásárló, kevés session, google + direct
        return Customer(f"a{i}", 1, 9_000 + 100 * i, T(30 + i), T(30 + i),
                        2 + i % 2, (1 + i % 2, 0, 0, 0, 1, 0))
    return Customer(f"b{i}", 3, 90_000 + 500 * i, T(0), T(60 + i),   # visszatérő, email-nehéz
                    10 + i % 3, (1, 0, 0, 1 + i % 3, 1, 7))


CUSTOMERS = [vevo(i, "a") for i in range(12)] + [vevo(i, "b") for i in range(12)]
TODAY = T(90)
LEDGER = {
    "identity": {"customers_identified": 24},
    "orders": {"dgp": 60, "pipeline": 48},
    "revenue_huf": {"dgp": 1_500_000, "pipeline": sum(c.revenue_huf for c in CUSTOMERS)},
}
IGAZ = ["alkalmi"] * 12 + ["markahu"] * 12
MIND = IGAZ + ["arvadasz"] * 4 + ["nagykosaras"] * 2


def test_egyezo_db_nel_nincs_hiba():
    assert check(CUSTOMERS, LEDGER) == []


@pytest.mark.parametrize("ut, ertek, szoveg", [
    (("identity", "customers_identified"), 23, "azonosított vevő"),
    (("orders", "pipeline"), 49, "rendelés darab"),
    (("revenue_huf", "pipeline"), 1, "rendelés érték"),
])
def test_minden_elteres_megnevezett_hiba(ut, ertek, szoveg):
    ledger = {**LEDGER, ut[0]: {**LEDGER[ut[0]], ut[1]: ertek}}
    hibak = check(CUSTOMERS, ledger)
    assert len(hibak) == 1 and hibak[0].startswith(szoveg), hibak


def test_a_becsles_minden_k_ra_megvan_es_k_2_a_ket_csoportot_adja():
    keys, X = build_features(CUSTOMERS, TODAY)
    b = estimate(CUSTOMERS, X)
    assert list(b) == list(KS) == [2, 3, 4, 5, 6, 7, 8]
    for k, bk in b.items():
        assert set(bk) == {"labels", "inertia", "silhouette", "sizes", "profiles"}
        assert bk["labels"].shape == (24,) and sum(bk["sizes"]) == 24
        assert len(bk["profiles"]) == k
        assert [p["customers"] for p in bk["profiles"]] == bk["sizes"]
    assert sorted(b[2]["sizes"]) == [12, 12]
    assert len(set(b[2]["labels"][:12])) == 1 and b[2]["labels"][0] != b[2]["labels"][12]
    assert b[2]["silhouette"] > b[8]["silhouette"]


def test_a_profil_eredeti_egysegben_kezzel_kiszamolva():
    labels = np.array([0] * 12 + [1] * 12)
    p = profile(CUSTOMERS, labels, 2)[0]
    assert p["customers"] == 12
    assert p["aov_huf"] == pytest.approx(114_600 / 12)        # a klaszter bevétele / rendelései
    assert p["orders_per_customer"] == 1.0
    assert p["sessions_per_customer"] == pytest.approx(2.5)
    # google-hányad: páros i-nél 1/2, páratlannál 2/3; direct a maradék
    assert p["channel_share"] == pytest.approx([7 / 12, 0, 0, 0, 5 / 12, 0])


def test_ures_klaszter_profilja_nullakkal_all():
    p = profile(CUSTOMERS, np.zeros(24, dtype=int), 2)
    assert p[0]["customers"] == 24
    assert p[1] == {"customers": 0, "aov_huf": 0.0, "orders_per_customer": 0.0,
                    "sessions_per_customer": 0.0, "channel_share": [0.0] * 6}


def test_a_kimenet_alakja_a_ket_keszlettel():
    keys, X = build_features(CUSTOMERS, TODAY)
    b = {nev: estimate(CUSTOMERS, select(X, f)) for nev, f in FEATURE_SETS.items()}
    adat = assemble(b, keys, X, IGAZ, MIND)
    assert adat["schema_version"] == 2
    assert adat["ks"] == list(KS) and adat["seed"] == SEED == 20260827
    assert adat["customers"] == 24 and adat["segments"] == list(SEGMENTS)
    assert adat["selection"] == {"all": [0.4, 4 / 30, 0.4, 2 / 30], "clustered": [0.5, 0, 0.5, 0]}
    assert adat["feature_sets"] == ["value", "all"] == list(adat["by_feature_set"])
    assert adat["by_feature_set"]["value"]["features"] == list(VALUE_FEATURES)
    assert adat["by_feature_set"]["all"]["features"] == list(FEATURES)
    for nev, keszlet in adat["by_feature_set"].items():
        assert set(keszlet) == {"features", "default_k", "ceiling", "by_k"}
        assert keszlet["default_k"] == max(KS, key=lambda k: b[nev][k]["silhouette"])
        assert set(keszlet["ceiling"]) == {"ari", "accuracy"}
        assert list(keszlet["by_k"]) == [str(k) for k in KS]
        for k, bk in keszlet["by_k"].items():
            assert set(bk) == {"silhouette", "inertia", "ari", "sizes", "profiles", "confusion"}
            assert len(bk["confusion"]) == 4 and all(len(sor) == int(k) for sor in bk["confusion"])
            assert [sum(oszlop) for oszlop in zip(*bk["confusion"])] == bk["sizes"]
            assert "labels" not in bk      # vevő-szintű címke nem megy a fájlba (3. szabály)
    # a két tesztcsoport értékben és csatornában is elválik: mindkét készlet megtalálja
    assert adat["by_feature_set"]["all"]["by_k"]["2"]["ari"] == 1.0
    assert adat["by_feature_set"]["value"]["by_k"]["2"]["ari"] == 1.0
    assert adat["by_feature_set"]["all"]["ceiling"]["accuracy"] == 1.0
    json.dumps(adat)                       # sorosítható, nincs benne numpy-típus


class Conn:
    read_only = False
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _kornyezet(monkeypatch, tmp_path, ledger):
    (tmp_path / "events_ledger.json").write_text(json.dumps(ledger), encoding="utf-8")
    monkeypatch.setattr(segments, "OUT", tmp_path)
    monkeypatch.setattr(segments.psycopg, "connect", lambda *a, **k: Conn())
    monkeypatch.setattr(segments, "fetch_today", lambda conn: TODAY)
    monkeypatch.setattr(segments, "fetch_customers", lambda conn: CUSTOMERS)
    monkeypatch.setattr(segments, "segments_truth", lambda keys: (IGAZ, MIND))


def test_ha_a_db_nem_egyezik_a_fokonyvvel_nem_ir_fajlt(monkeypatch, tmp_path):
    rossz = {**LEDGER, "orders": {"dgp": 60, "pipeline": 99}}
    _kornyezet(monkeypatch, tmp_path, rossz)
    with pytest.raises(SystemExit, match="NEM írok fájlt"):
        segments.main()
    assert not (tmp_path / "segments.json").exists()


def test_egyezo_db_nel_megirja_a_fajlt(monkeypatch, tmp_path):
    _kornyezet(monkeypatch, tmp_path, LEDGER)
    segments.main()
    adat = json.loads((tmp_path / "segments.json").read_text(encoding="utf-8"))
    assert adat["schema_version"] == 2 and adat["customers"] == 24


def test_nem_helyi_db_re_lekerdezes_nelkul_all_meg(monkeypatch, tmp_path):
    hivasok = []
    monkeypatch.setattr(segments, "DB_URL", "postgresql://u:p@db.prod.example:5432/fpcollector")
    monkeypatch.setattr(segments, "OUT", tmp_path)
    monkeypatch.setattr(segments.psycopg, "connect", lambda *a, **k: hivasok.append("connect"))
    with pytest.raises(ValueError, match="csak helyi"):
        segments.main()
    assert hivasok == []

"""A commitolt events_*.json fájlok őre. Nem futtat pipeline-t: azt ellenőrzi,
hogy ami a repóban van, az önmagával és egymással konzisztens, és hogy nem
került bele nyers eseményfolyam (3. nem-tárgyalható szabály)."""
import json
from pathlib import Path

import pytest

from world.config import ALL_SLUGS, WORLD
from world.export import SAMPLE_MAX_EVENTS

OUT = Path(__file__).resolve().parents[1] / "out"
FAJLOK = ("events_ledger.json", "events_daily.json", "events_sample.json")


@pytest.fixture(scope="module")
def ki():
    return {n: json.loads((OUT / n).read_text(encoding="utf-8")) for n in FAJLOK}


def test_a_harom_fajl_kicsi():
    for nev in FAJLOK:
        assert (OUT / nev).stat().st_size < 400_000, nev


def test_a_fokonyv_merlege_zar(ki):
    e = ki["events_ledger.json"]["events"]
    assert e["generated"] == e["withheld_no_consent"] + e["sent_unique"]
    assert e["raw_events"] == e["sent_unique"] == e["clean_events"]
    assert 5_300_000 <= e["generated"] <= 5_700_000


def test_a_pipeline_kevesebbet_lat_mint_a_dgp(ki):
    f = ki["events_ledger.json"]
    for kulcs in ("sessions", "orders", "revenue_huf"):
        assert 0 < f[kulcs]["pipeline"] < f[kulcs]["dgp"], kulcs
    i = f["identity"]
    assert i["persons_after_stitching"] < i["devices_pipeline"] < i["devices_dgp"]
    assert i["customers_identified"] <= i["identity_links"]


def test_a_latott_eszkozok_mogott_kevesebb_ember_all_mint_szemely(ki):
    i = ki["events_ledger.json"]["identity"]
    assert i["customers_identified"] <= i["customers_consented_dgp"] <= i["customers_dgp"]
    assert i["customers_consented_dgp"] < i["persons_after_stitching"]


def test_a_napi_sorok_osszege_a_fokonyv_pipeline_oldala(ki):
    d, f = ki["events_daily.json"], ki["events_ledger.json"]
    assert d["channels"] == list(ALL_SLUGS)
    assert d["start"] == WORLD.start.isoformat()
    for kulcs in ("sessions", "orders", "revenue_huf"):
        assert len(d[kulcs]) == 6
        assert all(len(sor) == WORLD.n_days for sor in d[kulcs])
        assert sum(map(sum, d[kulcs])) == f[kulcs]["pipeline"], kulcs


def test_minden_csatornan_van_forgalom(ki):
    for sor in ki["events_daily.json"]["sessions"]:
        assert sum(sor) > 0


def test_a_mintaszelet_ket_journey_es_kicsi(ki):
    j = {x["kind"]: x for x in ki["events_sample.json"]["journeys"]}
    assert set(j) == {"stitched_two_devices", "anonymous"}
    assert sum(len(x["raw_events"]) for x in j.values()) <= SAMPLE_MAX_EVENTS

    f = j["stitched_two_devices"]
    assert len({e["anonymous_id"] for e in f["clean_events"]}) == 2
    assert len({e["person_id"] for e in f["clean_events"]}) == 1     # ez a stitching
    assert len(f["orders"]) == 2 and len(f["identity_links"]) == 2
    assert len(f["raw_events"]) == len(f["clean_events"])

    n = j["anonymous"]
    assert n["orders"] == [] and n["identity_links"] == []
    assert {e["person_id"] for e in n["clean_events"]} == {n["clean_events"][0]["anonymous_id"]}

"""A commitolt events_emitted.json őre. Nem futtat semmit: azt ellenőrzi, hogy
a fájl kicsi (3. nem-tárgyalható szabály), és hogy ugyanabból a futásból való,
mint az events_sample.json — a lap a kettőt event_id szerint rendezi össze."""
import json
from pathlib import Path

import pytest

from world.export import EMITTED_MAX_EVENTS, NO_CONSENT_MAX_EVENTS

OUT = Path(__file__).resolve().parents[1] / "out"
SORSOK = {"sent", "withheld", "sent_twice"}


@pytest.fixture(scope="module")
def emitted():
    return json.loads((OUT / "events_emitted.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def sample():
    return json.loads((OUT / "events_sample.json").read_text(encoding="utf-8"))


def test_harom_journey_es_kicsi(emitted):
    assert emitted["schema_version"] == 1
    assert [j["kind"] for j in emitted["journeys"]] == ["stitched_two_devices", "anonymous", "no_consent"]
    assert sum(len(j["emitted_events"]) for j in emitted["journeys"]) <= EMITTED_MAX_EVENTS
    assert (OUT / "events_emitted.json").stat().st_size < 400_000


def test_minden_esemenynek_van_sorsa_es_azonositoja(emitted):
    for j in emitted["journeys"]:
        idk = [e["event_id"] for e in j["emitted_events"]]
        assert len(idk) == len(set(idk)), j["kind"]
        for e in j["emitted_events"]:
            assert e["fate"] in SORSOK
            assert (e["fate"] == "withheld") == (e["consent_analytics"] is False)


def test_egyezik_a_mintaszelettel(emitted, sample):
    minta = {j["kind"]: j for j in sample["journeys"]}
    for j in emitted["journeys"]:
        if j["kind"] == "no_consent":
            continue
        erkezett = {e["event_id"] for e in minta[j["kind"]]["raw_events"]}
        kuldott = {e["event_id"] for e in j["emitted_events"] if e["fate"] != "withheld"}
        assert erkezett == kuldott, j["kind"]


def test_a_consent_nelkuli_journey_nincs_a_mintaban(emitted, sample):
    nc = emitted["journeys"][2]["emitted_events"]
    assert 2 <= len(nc) <= NO_CONSENT_MAX_EVENTS
    assert all(e["fate"] == "withheld" for e in nc)
    assert nc[-1]["event_name"] == "purchase"
    megerkezett = {e["event_id"] for j in sample["journeys"] for e in j["raw_events"]}
    assert megerkezett.isdisjoint(e["event_id"] for e in nc)

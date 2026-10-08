"""Az elküldött réteg (events_emitted.json) tesztjei. Adatbázis nem kell
hozzájuk: a build_emitted() az emit folyamából és egy mintaszeletből dolgozik,
itt egy 30 napos próbavilágon, kézzel összerakott mintával."""
from itertools import groupby

import pytest

from world.config import EMIT
from world.dgp import run
from world.emit import events
from world.export import NO_CONSENT_MAX_EVENTS, build_emitted
from world.load import config_for


@pytest.fixture(scope="module")
def sessionok():
    """A próbavilág sessionjei, az emit sorrendjében: [(session_id, [esemény, …]), …]."""
    cfg = config_for(30)
    return [(sid, list(cs)) for sid, cs in
            groupby(events(run(cfg), cfg, EMIT), key=lambda e: e["session_id"])]


def _stream(sessionok):
    return (e for _, es in sessionok for e in es)


def _egyedi(es):
    return list({e["event_id"]: e for e in es}.values())


def _minta(sessionok):
    """Kézzel összerakott mintaszelet: ami a kiválasztott sessionökből megérkezne.
    A 'stitched' két vásárló session; az 'anonymous' olyan, amiben van duplikátum."""
    consentes = [es for _, es in sessionok if es[0]["consent_analytics"]]
    vasarlok = [es for es in consentes if es[-1]["event_name"] == "purchase"][:2]
    duplas = next(es for es in consentes
                  if len(es) != len(_egyedi(es)) and es[-1]["event_name"] != "purchase")

    def raw(*sess):
        return [{"event_id": e["event_id"], "session_id": e["session_id"]}
                for es in sess for e in _egyedi(es)]

    return {"schema_version": 1, "journeys": [
        {"kind": "stitched_two_devices", "raw_events": raw(*vasarlok)},
        {"kind": "anonymous", "raw_events": raw(duplas)},
    ]}


def test_harom_journey_a_minta_sorrendjeben(sessionok):
    ki = build_emitted(_stream(sessionok), _minta(sessionok))
    assert ki["schema_version"] == 1
    assert [j["kind"] for j in ki["journeys"]] == ["stitched_two_devices", "anonymous", "no_consent"]


def test_a_megerkezett_esemenyek_pontosan_az_elkuldottek(sessionok):
    minta = _minta(sessionok)
    ki = build_emitted(_stream(sessionok), minta)
    for j, m in zip(ki["journeys"], minta["journeys"]):
        assert {e["event_id"] for e in j["emitted_events"]} == {e["event_id"] for e in m["raw_events"]}
        assert all(e["fate"] in ("sent", "sent_twice") for e in j["emitted_events"])


def test_a_duplikatum_egy_sor_sent_twice_sorssal(sessionok):
    ki = build_emitted(_stream(sessionok), _minta(sessionok))
    nevtelen = ki["journeys"][1]["emitted_events"]
    idk = [e["event_id"] for e in nevtelen]
    assert len(idk) == len(set(idk))
    assert any(e["fate"] == "sent_twice" for e in nevtelen)


def test_a_journey_idorendben_all(sessionok):
    ki = build_emitted(_stream(sessionok), _minta(sessionok))
    for j in ki["journeys"]:
        idok = [e["occurred_at"] for e in j["emitted_events"]]
        assert idok == sorted(idok), j["kind"]


def test_a_consent_nelkuli_journey_vasarlas_es_semmi_nem_indult_el_belole(sessionok):
    ki = build_emitted(_stream(sessionok), _minta(sessionok))
    nc = ki["journeys"][2]["emitted_events"]
    assert 2 <= len(nc) <= NO_CONSENT_MAX_EVENTS
    assert all(e["fate"] == "withheld" and e["consent_analytics"] is False for e in nc)
    assert nc[0]["event_name"] == "page_view" and nc[-1]["event_name"] == "purchase"
    assert len({e["session_id"] for e in nc}) == 1


def test_ujrafuttatva_ugyanazt_adja(sessionok):
    minta = _minta(sessionok)
    assert build_emitted(_stream(sessionok), minta) == build_emitted(_stream(sessionok), minta)


def test_az_eredeti_esemenyt_nem_irja_at(sessionok):
    build_emitted(_stream(sessionok), _minta(sessionok))
    assert all("fate" not in e for _, es in sessionok for e in es)


def test_idegen_minta_hiba(sessionok):
    minta = _minta(sessionok)
    minta["journeys"][1]["raw_events"].append({"event_id": "x", "session_id": "nem-letezo-session"})
    with pytest.raises(LookupError, match="nem ebből a világból"):
        build_emitted(_stream(sessionok), minta)


def test_ha_a_minta_es_az_emit_nem_egyezik_hiba(sessionok):
    minta = _minta(sessionok)
    minta["journeys"][1]["raw_events"].pop()          # egy elküldött esemény "nem érkezett meg"
    with pytest.raises(ValueError, match="nem egyezik"):
        build_emitted(_stream(sessionok), minta)


def test_ha_nincs_consent_nelkuli_vasarlo_hiba(sessionok):
    csak_consentes = [(sid, es) for sid, es in sessionok if es[0]["consent_analytics"]]
    with pytest.raises(LookupError, match="nincs consent nélküli"):
        build_emitted(_stream(csak_consentes), _minta(sessionok))


def test_tul_nagy_szelet_hiba(sessionok, monkeypatch):
    import world.export as export
    monkeypatch.setattr(export, "EMITTED_MAX_EVENTS", 3)
    with pytest.raises(ValueError, match="plafon"):
        build_emitted(_stream(sessionok), _minta(sessionok))


def test_az_emitted_kapcsolo_nem_nyit_adatbazist(monkeypatch):
    import world.export as export
    hivasok = []
    monkeypatch.setattr(export, "write_emitted", lambda: hivasok.append("write_emitted"))
    monkeypatch.setattr(export.psycopg, "connect", lambda *a, **k: hivasok.append("connect"))
    monkeypatch.setattr("sys.argv", ["export", "--emitted"])
    export.main()
    assert hivasok == ["write_emitted"]

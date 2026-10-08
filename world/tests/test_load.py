import json

import httpx
import pytest

from world.config import WORLD
from world.load import batches, config_for, send, wait_for_worker
from world.local import require_local


def esemeny(i, consent=True):
    return {"event_id": f"e{i}", "consent_analytics": consent}


def kliens(handler):
    return httpx.Client(base_url="http://127.0.0.1:18080",
                        transport=httpx.MockTransport(handler))


# --- 2. nem-tárgyalható szabály -------------------------------------------------

@pytest.mark.parametrize("url", [
    "http://localhost:18080",
    "http://127.0.0.1:18080",
    "postgresql://u:p@127.0.0.1:15433/db",
    "postgresql://u:p@localhost/db",
])
def test_helyi_cim_atmegy(url):
    assert require_local(url) == url


@pytest.mark.parametrize("url", [
    "https://fp.growthframe.hu",
    "http://192.168.1.50:8000",
    "http://127.0.0.1.evil.example",
    "http://localhost.evil.example:18080",
    "http://evil.example/?x=127.0.0.1",
    "http://127.0.0.1@evil.example",
    "postgresql://u:p@db.internal:5432/fpcollector",
    "127.0.0.1:18080",        # séma nélkül nincs hostname
    "",
])
def test_nem_helyi_cim_hibat_dob(url):
    with pytest.raises(ValueError, match="csak helyi"):
        require_local(url)


@pytest.mark.parametrize("url", [
    "postgresql://u:p@127.0.0.1:15433/db?host=evil.example",
    "postgresql://u:p@127.0.0.1/db?hostaddr=10.0.0.5",
    "postgres://u:p@localhost/db?sslmode=disable",
])
def test_a_dsn_query_parametere_hibat_dob(url, monkeypatch):
    monkeypatch.delenv("PGHOSTADDR", raising=False)
    with pytest.raises(ValueError, match="csak helyi"):
        require_local(url)


def test_a_pghostaddr_env_hibat_dob_dsn_nel_http_nel_nem(monkeypatch):
    monkeypatch.setenv("PGHOSTADDR", "10.0.0.5")
    with pytest.raises(ValueError, match="csak helyi"):
        require_local("postgresql://u:p@127.0.0.1:15433/db")
    assert require_local("http://127.0.0.1:18080") == "http://127.0.0.1:18080"


def test_pghostaddr_nelkul_a_sima_dsn_atmegy(monkeypatch):
    monkeypatch.delenv("PGHOSTADDR", raising=False)
    url = "postgresql://u:p@127.0.0.1:15433/db"
    assert require_local(url) == url


def test_a_load_kliense_nem_olvas_proxy_env_et(monkeypatch):
    import world.load as load
    lathato = {}

    class HamisKliens:
        def __init__(self, **kw):
            lathato.update(kw)

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, path):
            return type("V", (), {"raise_for_status": lambda self: None})()

    monkeypatch.setattr(load, "COLLECTOR_URL", "http://127.0.0.1:18080")
    monkeypatch.setattr(load, "run", lambda cfg: None)
    monkeypatch.setattr(load, "events", lambda *a: [])
    monkeypatch.setattr(load, "send", lambda c, e: {
        "posted": 0, "accepted": 0, "duplicates": 0, "withheld": 0})
    monkeypatch.setattr(load, "wait_for_worker", lambda c: {
        "ingested": 0, "processed": 0, "failed": 0})
    monkeypatch.setattr(httpx, "Client", HamisKliens)
    monkeypatch.setattr("sys.argv", ["load"])
    load.main()
    assert lathato["trust_env"] is False
    assert lathato["base_url"] == "http://127.0.0.1:18080"


def test_a_load_nem_helyi_hosztra_keres_nelkul_all_meg(monkeypatch):
    import world.load as load
    kuldott = []
    monkeypatch.setattr(load, "COLLECTOR_URL", "https://fp.growthframe.hu")
    monkeypatch.setattr(load, "run", lambda cfg: kuldott.append("run"))
    monkeypatch.setattr(httpx, "Client", lambda **kw: kuldott.append("client"))
    monkeypatch.setattr("sys.argv", ["load"])
    with pytest.raises(ValueError, match="csak helyi"):
        load.main()
    assert kuldott == []          # se világ, se HTTP-kliens nem jött létre


# --- kötegelés és küldés --------------------------------------------------------

def test_a_kotegek_merete_es_sorrendje():
    k = list(batches((esemeny(i) for i in range(2500)), 1000))
    assert [len(x) for x in k] == [1000, 1000, 500]
    assert [e["event_id"] for x in k for e in x] == [f"e{i}" for i in range(2500)]
    assert list(batches([], 1000)) == []


def test_a_consent_nelkuli_esemeny_nem_megy_ki():
    kapott = []

    def handler(request):
        koteg = json.loads(request.content)["events"]
        kapott.extend(koteg)
        return httpx.Response(202, json={"accepted": len(koteg), "duplicates": 0,
                                         "consent_rejected": 0})

    forras = [esemeny(i, consent=(i % 4 != 0)) for i in range(2000)]
    with kliens(handler) as c:
        ki = send(c, forras)
    assert all(e["consent_analytics"] for e in kapott)
    assert len(kapott) == 1500
    assert ki == {"withheld": 500, "posted": 1500, "accepted": 1500, "duplicates": 0}


def test_ha_minden_esemeny_consent_nelkuli_nincs_keres():
    def handler(request):
        raise AssertionError("nem lett volna szabad kérést küldeni")

    with kliens(handler) as c:
        ki = send(c, [esemeny(i, consent=False) for i in range(10)])
    assert ki == {"withheld": 10, "posted": 0, "accepted": 0, "duplicates": 0}


def test_a_duplikatumokat_a_valaszbol_szamolja():
    def handler(request):
        return httpx.Response(202, json={"accepted": 7, "duplicates": 3, "consent_rejected": 0})

    with kliens(handler) as c:
        ki = send(c, [esemeny(i) for i in range(10)])
    assert (ki["accepted"], ki["duplicates"]) == (7, 3)


@pytest.mark.parametrize("statusz", [422, 404, 500])
def test_nem_202_valasznal_megall_es_nem_kuld_tobbet(statusz):
    keresek = []

    def handler(request):
        keresek.append(1)
        return httpx.Response(statusz, json={"detail": "hiba"})

    with kliens(handler) as c:
        with pytest.raises(RuntimeError, match=f"1. köteg {statusz}"):
            send(c, [esemeny(i) for i in range(3000)])
    assert len(keresek) == 1


def test_megvarja_a_workert():
    valaszok = iter([
        {"ingested": 10, "processed": 4, "failed": 0},
        {"ingested": 10, "processed": 9, "failed": 1},
    ])

    def handler(request):
        assert request.url.path == "/api/stats/health"
        return httpx.Response(200, json={**next(valaszok), "duplicates": 0, "duplicate_rate": 0.0})

    with kliens(handler) as c:
        a = wait_for_worker(c, poll_s=0)
    assert (a["processed"], a["failed"]) == (9, 1)


def test_a_worker_varakozasa_idotullepessel_all_meg():
    def handler(request):
        return httpx.Response(200, json={"ingested": 10, "processed": 0, "failed": 0})

    with kliens(handler) as c:
        with pytest.raises(TimeoutError):
            wait_for_worker(c, timeout_s=0, poll_s=0)


# --- próbafutás -----------------------------------------------------------------

def test_a_probafutas_vilaga_az_elso_n_nap():
    assert config_for(None) is WORLD
    cfg = config_for(30)
    assert (cfg.n_days, cfg.start, cfg.seed) == (30, WORLD.start, WORLD.seed)


@pytest.mark.parametrize("rossz", [0, -1, WORLD.n_days + 1])
def test_a_probafutas_hatarai(rossz):
    with pytest.raises(ValueError):
        config_for(rossz)

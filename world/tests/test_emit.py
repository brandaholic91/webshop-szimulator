import hashlib
import json
from collections import Counter
from dataclasses import replace
from datetime import datetime, timedelta

import numpy as np
import pytest

from world.config import ALL_SLUGS, EMIT, WORLD
from world.dgp import run
from world.emit import LANDING, PURCHASE, customer_key, events, plan, summary

# Az esemény-szintű tesztek egy 60 napos szeleten futnak: ugyanaz a kód, ~300 ezer
# esemény. A teljes világot csak a plan()/summary() látja, az másodpercek alatt megvan.
KICSI = replace(WORLD, end=WORLD.start + timedelta(days=59))


@pytest.fixture(scope="module")
def vilag():
    return run(WORLD)


@pytest.fixture(scope="module")
def osszegzes(vilag):
    return summary(vilag, plan(vilag, WORLD, EMIT))


@pytest.fixture(scope="module")
def kis_vilag():
    return run(KICSI)


@pytest.fixture(scope="module")
def kis_esemenyek(kis_vilag):
    return list(events(kis_vilag, KICSI, EMIT))


def _hash(esemenyek) -> str:
    h = hashlib.sha256()
    for e in esemenyek:
        h.update(json.dumps(e, sort_keys=True).encode())
    return h.hexdigest()


# --- a teljes világ számai ---------------------------------------------------

def test_az_osszes_esemeny_az_5_5_millios_savban_van(osszegzes):
    assert 5_300_000 <= osszegzes["events_generated"] <= 5_700_000


def test_a_merleg_zar(osszegzes):
    o = osszegzes
    assert o["events_generated"] == o["events_withheld_no_consent"] + o["events_sent_unique"]
    assert o["sessions_consented"] < o["sessions"]
    assert o["orders_consented"] < o["orders"]
    assert o["revenue_consented_huf"] < o["revenue_huf"]


def test_a_consent_elotti_vasarlas_a_dgp_rendelesei(vilag, osszegzes):
    assert osszegzes["orders"] == len(vilag.orders["day"])
    assert osszegzes["revenue_huf"] == int(vilag.orders["value_huf"].sum())


def test_a_visszautasitott_eszkozok_aranya_a_parameter_kozeleben_van(osszegzes):
    arany = 1 - osszegzes["devices_consented"] / osszegzes["devices"]
    assert abs(arany - EMIT.consent_decline_rate) < 0.01


def test_a_masodik_eszkozok_aranya_a_parameter_kozeleben_van(osszegzes):
    # Nem mindenki használja is a második eszközét, akinek van: ezért felső korlát.
    tobblet = osszegzes["devices"] / osszegzes["customers"] - 1
    assert 0.25 < tobblet <= EMIT.second_device_share + 0.01


def test_a_duplikatumok_aranya_a_parameter_kozeleben_van(osszegzes):
    arany = osszegzes["events_sent_duplicate"] / osszegzes["events_sent_unique"]
    assert abs(arany - EMIT.duplicate_rate) < 0.001


def test_a_consent_eszkozonkent_egyszer_es_vegleg_dol_el(vilag):
    pl = plan(vilag, WORLD, EMIT)
    eszkoz = vilag.touches["customer"].astype(np.int64) * 2 + pl.device
    adott = np.bincount(eszkoz, weights=pl.consent)
    ossz = np.bincount(eszkoz)
    hasznalt = ossz > 0
    assert np.all((adott[hasznalt] == 0) | (adott[hasznalt] == ossz[hasznalt]))


def test_az_emit_nem_nyul_a_vilag_sorsolasaihoz(vilag):
    elotte = vilag.orders["value_huf"].copy()
    plan(vilag, WORLD, EMIT)
    assert np.array_equal(run(WORLD).orders["value_huf"], elotte)


# --- az eseményfolyam ---------------------------------------------------------

def test_azonos_seed_azonos_esemenysor(kis_vilag, kis_esemenyek):
    assert _hash(events(kis_vilag, KICSI, EMIT)) == _hash(kis_esemenyek)


def test_mas_seed_mas_esemenysor(kis_esemenyek):
    mas = replace(KICSI, seed=KICSI.seed + 1)
    assert _hash(events(run(mas), mas, EMIT)) != _hash(kis_esemenyek)


def test_ket_kulonbozo_idoszaku_vilag_azonositoi_nem_utkoznek(kis_esemenyek):
    """Egy rövidebb próbavilág NEM a hosszabb eleje. Ha az azonosítóik egybeesnének,
    a collector a másodikat duplikátumnak nézné, és némán kevert adat állna a DB-ben."""
    rovid = replace(WORLD, end=WORLD.start + timedelta(days=29))
    rovid_esemenyek = list(events(run(rovid), rovid, EMIT))
    kozos = lambda kulcs: ({e[kulcs] for e in rovid_esemenyek}
                           & {e[kulcs] for e in kis_esemenyek})
    assert kozos("event_id") == set()
    assert kozos("session_id") == set()
    # az eszköz viszont ugyanaz a két világban: a populáció nem függ az időszaktól
    assert kozos("anonymous_id")


def test_a_folyam_darabszama_egyezik_az_osszegzessel(kis_vilag, kis_esemenyek):
    o = summary(kis_vilag, plan(kis_vilag, KICSI, EMIT))
    egyedi = {e["event_id"] for e in kis_esemenyek}
    kuldott = [e for e in kis_esemenyek if e["consent_analytics"]]
    assert len(egyedi) == o["events_generated"]
    assert len({e["event_id"] for e in kuldott}) == o["events_sent_unique"]
    assert len(kuldott) - o["events_sent_unique"] == o["events_sent_duplicate"]
    assert len(kis_esemenyek) - len(egyedi) == o["events_sent_duplicate"]


def test_consent_nelkuli_esemenybol_nincs_duplikatum(kis_esemenyek):
    db = Counter(e["event_id"] for e in kis_esemenyek if not e["consent_analytics"])
    assert max(db.values()) == 1


def test_a_purchase_esemenyek_pontosan_a_dgp_rendelesei(kis_vilag, kis_esemenyek):
    vasarlas = {e["event_id"]: e for e in kis_esemenyek if e["event_name"] == "purchase"}
    assert len(vasarlas) == len(kis_vilag.orders["day"])
    assert (sum(e["payload"]["value"] for e in vasarlas.values())
            == int(kis_vilag.orders["value_huf"].sum()))
    rendeles_id = [e["payload"]["order_id"] for e in vasarlas.values()]
    assert len(set(rendeles_id)) == len(rendeles_id)
    for e in vasarlas.values():
        assert set(e["payload"]) == {"order_id", "value", "currency", "customer_key"}
        assert e["payload"]["currency"] == "HUF"
        assert e["payload"]["value"] > 0


def test_a_customer_key_atlatszatlan_es_stabil(kis_vilag, kis_esemenyek):
    kulcsok = {e["payload"]["customer_key"] for e in kis_esemenyek
               if e["event_name"] == "purchase"}
    assert len(kulcsok) == len(np.unique(kis_vilag.orders["customer"]))
    c = int(kis_vilag.orders["customer"][0])
    assert customer_key(KICSI.seed, c) in kulcsok
    # sem a vásárló sorszáma, sem a szegmense nem olvasható ki belőle
    assert str(c) != customer_key(KICSI.seed, c)
    assert not any(s.slug in k for s in WORLD.segments for k in kulcsok)


def test_a_session_forgatokonyve_ervenyes(kis_esemenyek):
    sessionok: dict[str, list[dict]] = {}
    for e in {e["event_id"]: e for e in kis_esemenyek}.values():
        sessionok.setdefault(e["session_id"], []).append(e)
    rang = {"page_view": 1, "view_item": 1, "add_to_cart": 2,
            "begin_checkout": 3, "purchase": 4}
    for sor in sessionok.values():
        nevek = [e["event_name"] for e in sor]
        idok = [datetime.fromisoformat(e["occurred_at"]) for e in sor]
        assert nevek[0] == "page_view"
        assert idok == sorted(idok) and len(set(idok)) == len(idok)   # szigorúan nő
        assert [rang[n] for n in nevek] == sorted(rang[n] for n in nevek)
        assert len({e["anonymous_id"] for e in sor}) == 1
        assert len({e["consent_analytics"] for e in sor}) == 1
        for ritka in ("add_to_cart", "begin_checkout", "purchase"):
            assert nevek.count(ritka) <= 1
        if "add_to_cart" in nevek:
            elotte = sor[nevek.index("add_to_cart") - 1]
            assert elotte["event_name"] == "view_item"
            assert sor[nevek.index("add_to_cart")]["payload"] == elotte["payload"]
        if "purchase" in nevek:
            assert nevek[-3:] == ["add_to_cart", "begin_checkout", "purchase"]
        if "begin_checkout" in nevek:
            assert "add_to_cart" in nevek


def test_forrasjel_csak_a_landing_esemenyen_van(kis_vilag, kis_esemenyek):
    jelek = ("utm_source", "utm_medium", "referrer")
    sessionok: dict[str, list[dict]] = {}
    for e in {e["event_id"]: e for e in kis_esemenyek}.values():   # duplikátum nélkül
        sessionok.setdefault(e["session_id"], []).append(e)
    # a sessionök a World.touches sorrendjében jönnek
    csatornak = [ALL_SLUGS[c] for c in kis_vilag.touches["channel"]]
    assert len(sessionok) == len(csatornak)
    for sor, slug in zip(sessionok.values(), csatornak):
        assert {j: sor[0][j] for j in jelek if j in sor[0]} == LANDING[slug]
        for e in sor[1:]:
            assert not any(j in e for j in jelek)


def test_minden_melyseg_elofordul_es_a_vasarlo_vegigmegy(vilag):
    pl = plan(vilag, WORLD, EMIT)
    assert set(np.unique(pl.depth)) == {0, 1, 2, 3, 4}
    assert np.all(pl.depth[vilag.orders["touch"]] == PURCHASE)
    assert int((pl.depth == PURCHASE).sum()) == len(vilag.orders["touch"])
    assert np.all(pl.n_browse[pl.depth >= 1] >= 1)
    assert np.all(pl.n_browse[pl.depth == 0] == 0)

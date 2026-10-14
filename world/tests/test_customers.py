from datetime import datetime, timedelta, timezone
from decimal import Decimal

import numpy as np
import pytest

from world.config import ALL_SLUGS
from world.customers import (FEATURES, VALUE_FEATURES, Customer, build_features, raw_features,
                             select, to_customers)

T0 = datetime(2024, 1, 1, 12, tzinfo=timezone.utc)
T = lambda nap: T0 + timedelta(days=nap)

# (customer_key, orders, revenue_huf, first_order, last_order, source_medium, sessions)
ROWS = [
    ("v1", 2, Decimal("30000"), T(0), T(10), "direct / none", 1),
    ("v1", 2, Decimal("30000"), T(0), T(10), "google / cpc", 3),
    ("v2", 1, Decimal("8000"), T(5), T(5), "newsletter / email", 2),
]


def test_a_sorokbol_vevonkent_egy_customer_lesz():
    assert to_customers(ROWS) == [
        Customer("v1", 2, 30000, T(0), T(10), 4, (3, 0, 0, 0, 1, 0)),
        Customer("v2", 1, 8000, T(5), T(5), 2, (0, 0, 0, 0, 0, 2)),
    ]
    assert type(to_customers(ROWS)[0].revenue_huf) is int


@pytest.mark.parametrize("forras", ["bing / cpc", None])
def test_ismeretlen_forras_hiba_nem_nema_eldobas(forras):
    with pytest.raises(ValueError, match="ismeretlen source_medium"):
        to_customers([("v1", 1, Decimal("100"), T(0), T(0), forras, 1)])


def test_tort_forint_hiba_nem_nema_csonkolas():
    with pytest.raises(ValueError, match="tört forint"):
        to_customers([("v1", 1, Decimal("100.5"), T(0), T(0), "direct / none", 1)])


def test_ures_vevolistabol_nincs_jellemzo_matrix():
    with pytest.raises(ValueError, match="nincs vevő"):
        build_features([], T(0))


V1 = Customer("v1", 2, 30000, T(0), T(10), 4, (3, 0, 0, 0, 1, 0))
V2 = Customer("v2", 1, 8000, T(5), T(5), 2, (0, 0, 0, 0, 0, 2))
V3 = Customer("v3", 4, 100000, T(2), T(12), 10, (2, 2, 2, 2, 1, 1))
TODAY = T(12) + timedelta(hours=12)


def test_a_nyers_jellemzok_kezzel_kiszamolva():
    X = raw_features([V1, V2], TODAY)
    assert X.shape == (2, 12) and len(FEATURES) == 12
    assert FEATURES[:6] == ("log_orders", "log_aov", "log_revenue", "recency_days",
                            "tenure_days", "log_sessions")
    assert FEATURES[6:] == tuple(f"share_{s}" for s in ALL_SLUGS)
    v1 = X[0]
    assert v1[0] == pytest.approx(np.log(2))
    assert v1[1] == pytest.approx(np.log(15000))      # 30 000 / 2
    assert v1[2] == pytest.approx(np.log(30000))
    assert v1[3] == pytest.approx(2.5)                 # T(12)+12h − T(10)
    assert v1[4] == pytest.approx(12.5)
    assert v1[5] == pytest.approx(np.log(4))
    assert v1[6:] == pytest.approx([0.75, 0, 0, 0, 0.25, 0])
    assert X[1, 6:] == pytest.approx([0, 0, 0, 0, 0, 1])
    # a csatorna-hányadok összege mindenkinél 1
    assert X[:, 6:].sum(axis=1) == pytest.approx([1.0, 1.0])


def test_a_standardizalt_jellemzok_atlaga_0_szorasa_1():
    keys, X = build_features([V1, V2, V3], TODAY)
    assert keys == ["v1", "v2", "v3"]
    assert X.shape == (3, 12)
    assert X.mean(axis=0) == pytest.approx(np.zeros(12), abs=1e-12)
    valtozo = raw_features([V1, V2, V3], TODAY).std(axis=0) > 0
    assert X[:, valtozo].std(axis=0) == pytest.approx(np.ones(valtozo.sum()))


def test_allando_oszlop_nem_ad_nan_t():
    """Ha egy csatornáról senki nem jött, a szórás 0: az oszlop 0 marad, nem NaN."""
    _, X = build_features([V1, V2], TODAY)
    assert not np.isnan(X).any()
    meta = FEATURES.index("share_meta_ads")
    assert X[:, meta] == pytest.approx([0.0, 0.0])


def test_az_ertekjellemzok_az_elso_ot_es_a_kivalasztas_oszlopot_valaszt():
    assert VALUE_FEATURES == ("log_orders", "log_aov", "log_revenue", "recency_days", "tenure_days")
    X = np.arange(24, dtype=float).reshape(2, 12)
    assert np.array_equal(select(X, VALUE_FEATURES), X[:, :5])
    assert np.array_equal(select(X, FEATURES), X)
    assert np.array_equal(select(X, ("share_email", "log_orders")), X[:, [11, 0]])
    with pytest.raises(ValueError):
        select(X, ("nincs_ilyen",))

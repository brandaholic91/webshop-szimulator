import numpy as np
import pytest
from world.response import adstock, saturate, response_curve


def test_adstock_kezzel_szamolva():
    # a[t] = x[t] + λ·a[t-1]; egyetlen 100-as impulzus, λ=0,5
    ki = adstock(np.array([100.0, 0.0, 0.0, 0.0]), decay=0.5)
    assert ki == pytest.approx([100.0, 50.0, 25.0, 12.5])


def test_adstock_nulla_lecsengessel_valtozatlan():
    x = np.array([3.0, 7.0, 1.0])
    assert adstock(x, decay=0.0) == pytest.approx(x)


def test_adstock_osszege_a_geometriai_sor():
    # Egy impulzus teljes súlya 1/(1-λ)
    ki = adstock(np.concatenate([[100.0], np.zeros(400)]), decay=0.7)
    assert float(ki.sum()) == pytest.approx(100.0 / (1 - 0.7), rel=1e-6)


def test_szaturacio_a_felpontban_pontosan_fel():
    assert float(saturate(np.array([5000.0]), half=5000.0, shape=1.7)[0]) == pytest.approx(0.5)


def test_szaturacio_nullaban_nulla_es_korlatos():
    assert float(saturate(np.array([0.0]), half=100.0, shape=2.0)[0]) == 0.0
    assert float(saturate(np.array([1e9]), half=100.0, shape=2.0)[0]) == pytest.approx(1.0, abs=1e-6)


def test_szaturacio_monoton():
    x = np.linspace(0, 50_000, 200)
    y = saturate(x, half=12_000.0, shape=1.4)
    assert np.all(np.diff(y) >= 0)


def test_response_curve_a_ketto_kompozicioja():
    x = np.array([10_000.0, 0.0, 0.0])
    vart = saturate(adstock(x, 0.4), 8_000.0, 1.5)
    assert response_curve(x, 0.4, 8_000.0, 1.5) == pytest.approx(vart)

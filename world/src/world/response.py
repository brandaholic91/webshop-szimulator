"""Költés -> elérés: adstock (lecsengés) és szaturáció (csökkenő hozadék).

Ez a modul TISZTA: nincs benne véletlen, nincs benne állapot. Két oka van, hogy
külön áll: (1) kézzel kiszámolható elvárt értékei vannak, tehát ez a tesztek
gerince; (2) a demos/world/response.ts ugyanezt a két képletet értékeli ki a
böngészőben (27. döntés), és a kettőnek egyeznie kell.
"""
import numpy as np


def adstock(x: np.ndarray, decay: float) -> np.ndarray:
    """Geometrikus adstock: a[t] = x[t] + decay * a[t-1].

    A mai költés hatása nem ma ér véget. A decay (λ) azt mondja meg, mennyi
    marad belőle másnapra. λ=0 -> nincs átvitel; λ->1 -> szinte nem cseng le.
    """
    if not 0.0 <= decay < 1.0:
        raise ValueError(f"decay a [0,1) intervallumban: {decay}")
    ki = np.empty_like(x, dtype=float)
    hordozott = 0.0
    for t, ertek in enumerate(x):
        hordozott = float(ertek) + decay * hordozott
        ki[t] = hordozott
    return ki


def saturate(x: np.ndarray, half: float, shape: float) -> np.ndarray:
    """Hill-szaturáció: x^a / (x^a + half^a). A half pontban pontosan 0,5.

    A kétszer annyi költés nem hoz kétszer annyi elérést. A 'half' a
    félszaturációs pont (Ft/nap adstockolt költésben), a 'shape' a meredekség.
    """
    if half <= 0 or shape <= 0:
        raise ValueError("half és shape pozitív")
    xa = np.power(np.asarray(x, dtype=float), shape)
    return xa / (xa + half**shape)


def response_curve(x: np.ndarray, decay: float, half: float, shape: float) -> np.ndarray:
    """A teljes lánc: nyers költés -> adstock -> szaturáció -> [0,1] válasz."""
    return saturate(adstock(x, decay), half, shape)

"""Rétegenként független véletlen-stream (26. döntés).

Miért nem egy közös Generator: az igazság két világ különbsége (9. döntés) — a
teljes világ és az, amiben egy csatorna költése nulla. Közös generátorral a
nullázás ELCSÚSZTATNÁ az összes rákövetkező sorsolást, tehát más vásárlókat és
más bázis-keresletet kapnánk. A kapott "inkrementalitás" akkor zaj lenne, ÉS EZ
NEM LÁTSZANA A SZÁMON.

A rétegelés ezt a durva torzítást zárja ki, NEM az összes zajt: a `population`
és a `spend` réteg minden ellentényes futásban bitre azonos, mert saját
streamből jönnek, amit a nullázás nem ér el. A `touch` rétegen belül viszont
marad egy maradék bizonytalanság — a `numpy.random.Generator.poisson(0)` nulla
uniformot fogyaszt, tehát ha egy csatorna várható érintésszáma nullára esik,
a UGYANARRÓL a streamről utána húzott sorsolások (a többi csatorna napi
érintés-kiosztása, majd a `conversion` és `orders` réteg is ezekre épül) más
ponttól folytatódnak, mint a teljes világban. Ez a maradék eltolódás a mért
kb. ±2,5 M Ft (1σ) zaj forrása egy csatorna inkrementalitásán — ezért a
truth.json és a lap száma nagyságrend, nem az utolsó forintig pontos érték.

A LAYERS tuple sorrendje szerződés: a spawn() sorrend-függő, tehát új réteget
KIZÁRÓLAG a végére szabad fűzni. Beszúrás az összes utána következő streamet
elcsúsztatja, és minden korábban commitolt out/ érvénytelen lesz.

A "capture" réteg (37. döntés) a session-címkék átírását sorsolja. A világ minden
sessionjére húz, nem csak az elfoghatókra, tehát a fogyasztása csak a sessionök
számától függ.
"""
import numpy as np

LAYERS = ("population", "spend", "touch", "conversion", "orders", "lifetime", "emit", "capture")


def streams(seed: int) -> dict[str, np.random.Generator]:
    gyerekek = np.random.SeedSequence(seed).spawn(len(LAYERS))
    return {nev: np.random.default_rng(mag) for nev, mag in zip(LAYERS, gyerekek)}

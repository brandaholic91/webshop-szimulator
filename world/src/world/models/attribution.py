"""A négy attribúciós modell. Útvonalak be, csatornánként kiosztott bevétel ki.

Tiszta függvények: nincs bennük fájl, adatbázis vagy véletlen. A bemenet a
journeys.build_paths kimenete (channels, days, value_huf mezőjű útvonalak); a
kimenet {csatorna: kiosztott bevétel Ft-ban}, csak azokra a csatornákra, amik
kaptak valamit. Minden modell a konvertáló útvonalak teljes bevételét osztja szét.

Az első három modell csak a konvertáló útvonalakat nézi; a Markov a nem
konvertálókat is, mert azokból tudja, honnan megy el a látogató vásárlás nélkül.
"""
from collections import Counter, defaultdict

import numpy as np

HALF_LIFE_DAYS = 7.0     # a time-decay felezési ideje; rögzített, nem beállítás

START, CONV, NULL = "(start)", "(conversion)", "(null)"


def last_click(paths) -> dict[str, float]:
    """Az útvonal teljes bevétele az utolsó session csatornájáé."""
    ki: dict[str, float] = defaultdict(float)
    for p in paths:
        if p.value_huf is not None:
            ki[p.channels[-1]] += p.value_huf
    return dict(ki)


def linear(paths) -> dict[str, float]:
    """Az útvonal bevétele egyenlően oszlik a sessionjei között."""
    ki: dict[str, float] = defaultdict(float)
    for p in paths:
        if p.value_huf is None:
            continue
        resz = p.value_huf / len(p.channels)
        for c in p.channels:
            ki[c] += resz
    return dict(ki)


def time_decay(paths) -> dict[str, float]:
    """A session súlya 2^(-t/7), ahol t a távolsága napokban a vásárló sessiontől."""
    ki: dict[str, float] = defaultdict(float)
    for p in paths:
        if p.value_huf is None:
            continue
        sulyok = [2 ** (-t / HALF_LIFE_DAYS) for t in p.days]
        osszeg = sum(sulyok)
        for c, w in zip(p.channels, sulyok):
            ki[c] += p.value_huf * w / osszeg
    return dict(ki)


def _transitions(paths) -> Counter:
    """Átmenet-számlálás: START -> csatornák -> CONV (konvertáló) vagy NULL."""
    szamlalo: Counter = Counter()
    for p in paths:
        lepesek = (START, *p.channels, CONV if p.value_huf is not None else NULL)
        szamlalo.update(zip(lepesek, lepesek[1:]))
    return szamlalo


def _conversion_probability(szamlalo: Counter, removed: str | None = None) -> float:
    """A konverzió valószínűsége START-ból, a nyelő lánc egyenletrendszeréből.

    x = Q·x + r, ahol Q az átmeneti állapotok (START és a csatornák) közti
    átmenetek mátrixa, r pedig a közvetlenül CONV-ba lépés valószínűsége.
    `removed`: az ebbe a csatornába vezető minden átmenet NULL-ba megy.
    """
    allapotok = [START, *sorted({a for a, _ in szamlalo} - {START})]
    hely = {a: i for i, a in enumerate(allapotok)}
    n = len(allapotok)
    q = np.zeros((n, n))
    r = np.zeros(n)
    kimeno = np.zeros(n)
    for (honnan, hova), db in szamlalo.items():
        i = hely[honnan]
        kimeno[i] += db
        if hova == removed or hova == NULL:
            continue
        if hova == CONV:
            r[i] += db
        else:
            q[i, hely[hova]] += db
    q /= kimeno[:, None]
    r /= kimeno
    return float(np.linalg.solve(np.eye(n) - q, r)[0])


def removal_effects(paths) -> dict[str, float]:
    """Csatornánként: a konverzió valószínűségének hányad része tűnik el nélküle."""
    szamlalo = _transitions(paths)
    teljes = _conversion_probability(szamlalo)
    csatornak = sorted({a for a, _ in szamlalo} - {START})
    return {c: 1 - _conversion_probability(szamlalo, c) / teljes for c in csatornak}


def markov(paths) -> dict[str, float]:
    """Elsőrendű Markov-lánc: a teljes bevétel a removal effectek arányában oszlik.

    Ismert egyszerűsítés: a teljes bevételt osztja szét, tehát nem látja, hogy
    egyes útvonalak kosárértéke nagyobb.
    """
    bevetel = sum(p.value_huf for p in paths if p.value_huf is not None)
    hatas = removal_effects(paths)
    osszeg = sum(hatas.values())
    return {c: bevetel * h / osszeg for c, h in hatas.items()}

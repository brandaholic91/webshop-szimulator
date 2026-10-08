"""A világ hat rétege. Vásárló-szinten generál; minden aggregátum ebből származik
(9. döntés) — ha az MMM-nek és az MTA-nak külön generálnánk, két különböző világot
mérnének, és az összehasonlításuk hazugság lenne.

Rétegek: populáció -> költés -> érintés -> konverzió -> rendelés (+ élettartam).

Az érintés és a konverzió között egy elfogás-lépés a bázis-sessionök egy részét
fizetett csatornára címkézi át (37. döntés). Nem réteg: a rendelésekhez nem ér.
"""
from dataclasses import dataclass
import numpy as np

from .config import ALL_SLUGS, PAID_SLUGS, WorldConfig
from .response import response_curve


@dataclass(frozen=True)
class Population:
    segment_idx: np.ndarray   # (n,) int, a WORLD.segments indexe
    propensity: np.ndarray    # (n,) log-odds eltolás
    aov_factor: np.ndarray    # (n,) kosárérték-szorzó
    affinity: np.ndarray      # (n, 6) csatorna-affinitás, ALL_SLUGS sorrendben
    churn_day: np.ndarray     # (n,) int, ettől a naptól nem kap érintést


def build_population(cfg: WorldConfig, gen: np.random.Generator) -> Population:
    """1. réteg — vásárló-populáció latens tulajdonságokkal.

    A latens SZEGMENS a `segments` műszer igazsága: a modellnek ezt kell majd
    visszanyernie, anélkül hogy látná.
    """
    n = cfg.n_customers
    aranyok = np.array([s.share for s in cfg.segments])
    seg = gen.choice(len(cfg.segments), size=n, p=aranyok)

    alap_prop = np.array([s.propensity for s in cfg.segments])[seg]
    propensity = alap_prop + gen.normal(0.0, 0.45, size=n)

    alap_aov = np.array([s.aov_factor for s in cfg.segments])[seg]
    aov_factor = alap_aov * np.exp(gen.normal(0.0, 0.20, size=n))

    alap_aff = np.array([s.affinity for s in cfg.segments])[seg]        # (n, 6)
    affinity = alap_aff * np.exp(gen.normal(0.0, 0.30, size=(n, 6)))

    # Az élettartam SAJÁT streamből jönne, de a churn a populáció tulajdonsága —
    # itt a population streamből húzzuk, a lifetime stream a CLV-nek marad
    # fenntartva (27. döntés (a) pont).
    hazard = np.array([s.churn_hazard_daily for s in cfg.segments])[seg]
    churn_day = gen.exponential(1.0 / hazard).astype(int)

    return Population(seg, propensity, aov_factor, affinity, churn_day)


def seasonality(cfg: WorldConfig) -> np.ndarray:
    """A bázis-kereslet szorzója naponta: trend + heti + éves + Black Friday.

    Ez az intercept, amit az MMM-nek meg kell találnia. Ha a modell ezt a
    csatornáknak tulajdonítja, felülbecsül — pontosan ez az attribution lecke.
    """
    napok = cfg.days
    n = len(napok)

    trend = np.linspace(1.0, cfg.base_sessions_end / cfg.base_sessions_start, n)

    heti = np.array([cfg.weekday_factor[d.weekday()] for d in napok])

    evnap = np.array([d.timetuple().tm_yday for d in napok])
    evi = 1.0 + cfg.yearly_amplitude * np.cos(2 * np.pi * (evnap - 330) / 365.25)

    honap = np.array([d.month for d in napok])
    q4 = np.where(np.isin(honap, (11, 12)), cfg.q4_boost, 1.0)

    bf = np.ones(n)
    for i, d in enumerate(napok):
        # Black Friday: november utolsó péntekje, és az azt követő hétfő
        if d.month == 11 and d.weekday() == 4 and d.day >= 24:
            bf[i] = cfg.black_friday_boost
            if i + 3 < n:
                bf[i + 3] = cfg.black_friday_boost * 0.7

    return trend * heti * evi * q4 * bf


def build_spend(cfg: WorldConfig, gen: np.random.Generator) -> np.ndarray:
    """2. réteg — napi költés a három fizetett csatornán, Ft.

    Havi budget-lépcsők (a hirdető havonta állít), napi zaj, és ugyanaz a
    szezonális nyomás, ami a keresletet mozgatja — ettől lesz a költés és a
    bevétel KORRELÁLT, ami az MMM valódi nehézsége.
    """
    napok = cfg.days
    n = len(napok)
    szez = seasonality(cfg)

    # havi budget-szorzó: minden hónapra egy húzás, a hónap minden napjára ugyanaz
    honap_kulcs = np.array([d.year * 12 + d.month for d in napok])
    egyedi = np.unique(honap_kulcs)
    havi = gen.lognormal(0.0, 0.12, size=len(egyedi))
    havi_map = dict(zip(egyedi.tolist(), havi.tolist()))
    havi_szorzo = np.array([havi_map[k] for k in honap_kulcs])

    ki = np.zeros((n, len(PAID_SLUGS)))
    for j, slug in enumerate(PAID_SLUGS):
        ch = cfg.channel(slug)
        napi_zaj = gen.lognormal(0.0, 0.10, size=n)
        ki[:, j] = ch.daily_base_huf * havi_szorzo * szez * napi_zaj
    return np.round(ki, 0)


@dataclass(frozen=True)
class World:
    days: list
    spend: np.ndarray                    # (n_days, 3) Ft
    sessions_by_channel: np.ndarray      # (n_days, 6) session-szám, a megfigyelt csatornán
    touches: dict                        # customer, day, channel (megfigyelt), base_channel (eredeti)
    orders: dict                         # customer, day, value_huf, touch
    population: Population


# Csak a keresésből és a közvetlenül érkező session fogható el. Az email
# kampánykattintás: azt a hirdetés nem viszi el (37. döntés).
CAPTURABLE = ("organic", "direct")


def _response(cfg: WorldConfig, spend: np.ndarray) -> np.ndarray:
    """Költés -> [0, 1] válasz csatornánként, adstockkal és szaturációval. (n_days, 3)"""
    ki = np.zeros_like(spend)
    for j, slug in enumerate(PAID_SLUGS):
        ch = cfg.channel(slug)
        ki[:, j] = response_curve(spend[:, j], ch.adstock_decay, ch.half_saturation,
                                  ch.saturation_shape)
    return ki


def _paid_sessions(cfg: WorldConfig, valasz: np.ndarray) -> np.ndarray:
    """3. réteg — válasz -> elérés: a csatorna telített session-számának hányada."""
    return valasz * np.array([cfg.channel(s).reach_scale for s in PAID_SLUGS])


def _capture(cfg: WorldConfig, valasz: np.ndarray, touches: dict,
             gen: np.random.Generator) -> np.ndarray:
    """Elfogás (37. döntés): a megfigyelt csatorna sessionönként.

    Egy organic vagy direct sessiont a `c` fizetett csatorna a `d` napon
    capture_max_c * válasz_c(d) eséllyel visz el. Nulla költésnél a válasz
    nulla, tehát az ellentényes világban magától nincs elfogás.
    """
    # Minden sessionre sorsolunk, nem csak az elfoghatókra: így a stream
    # fogyasztása nem függ a címkéktől.
    u = gen.random(len(touches["day"]))
    p = valasz * np.array([cfg.channel(s).capture_max for s in PAID_SLUGS])   # (n_days, 3)
    # A [0, 1) elején egymás után áll a három csatorna sávja; a maradék: senki.
    hatar = np.cumsum(p, axis=1)[touches["day"]]                              # (n_session, 3)
    sav = (u[:, None] >= hatar).sum(axis=1)       # 0..2: a csatorna indexe; 3: senki
    eredeti = touches["channel"]
    elfoghato = np.isin(eredeti, [ALL_SLUGS.index(s) for s in CAPTURABLE])
    return np.where(elfoghato & (sav < len(PAID_SLUGS)), sav, eredeti)


def run(cfg: WorldConfig, gen: dict | None = None) -> World:
    """A hat réteg összefűzése. Ez A VILÁG.

    `gen`: a rétegek streamjei; alapból a seedből jönnek. Csak a noise.py ad
    mást, amikor a zajt méri.
    """
    from .rng import streams
    gen = gen or streams(cfg.seed)
    napok = cfg.days
    n = cfg.n_days

    pop = build_population(cfg, gen["population"])
    spend = build_spend(cfg, gen["spend"])
    szez = seasonality(cfg)

    # --- 3-4. réteg: hány session csatornánként naponta, és ki kapja ---
    valasz = _response(cfg, spend)                              # (n, 3)
    fizetett = _paid_sessions(cfg, valasz)                      # (n, 3)
    alap = cfg.base_sessions_start * szez                       # (n,)
    nem_fizetett = np.stack(
        [alap * cfg.channel(s).base_share for s in ("organic", "direct", "email")],
        axis=1,
    )                                                            # (n, 3)
    varhato = np.concatenate([fizetett, nem_fizetett], axis=1)   # (n, 6)
    sessions = gen["touch"].poisson(varhato)                     # (n, 6)

    # A session-öket vásárlókhoz rendeljük az affinitásuk szerint. Az élő-maszkot
    # naponta számoljuk: a teljes (n_days, n_customers) mátrix 33 MB lenne feleslegesen.
    t_cust, t_day, t_chan = [], [], []
    tg = gen["touch"]
    for c in range(6):
        suly_oszlop = pop.affinity[:, c]
        for d in range(n):
            k = int(sessions[d, c])
            if k == 0:
                continue
            elo_maszk = pop.churn_day > d
            suly = np.where(elo_maszk, suly_oszlop, 0.0)
            osszeg = suly.sum()
            if osszeg <= 0:
                continue
            valasztott = tg.choice(cfg.n_customers, size=k, p=suly / osszeg)
            t_cust.append(valasztott)
            t_day.append(np.full(k, d))
            t_chan.append(np.full(k, c))

    touches = {
        "customer": np.concatenate(t_cust),
        "day": np.concatenate(t_day),
        "channel": np.concatenate(t_chan),
    }
    rend = np.lexsort((touches["customer"], touches["day"]))
    touches = {k: v[rend] for k, v in touches.items()}

    # --- elfogás: a bázis-sessionök egy része fizetett címkét kap ---
    # A konverzió nem olvas csatornát, tehát a rendelésekhez ez nem ér.
    touches["base_channel"] = touches["channel"]
    touches["channel"] = _capture(cfg, valasz, touches, gen["capture"])
    megfigyelt = np.bincount(touches["day"] * 6 + touches["channel"],
                             minlength=n * 6).reshape(n, 6)

    # --- 5. réteg: konverzió session-önként ---
    # journey_strength: hány érintés érte a vásárlót a lookback ablakban,
    # csökkenő súllyal. Ezt gördülő számlálóval számoljuk, vásárlónként.
    ereje = _journey_strength(cfg, touches)
    log_odds = (
        cfg.conversion_intercept
        + pop.propensity[touches["customer"]]
        + cfg.touch_effect * ereje
        + np.log(szez[touches["day"]])
    )
    p = 1.0 / (1.0 + np.exp(-log_odds))
    konvertal = gen["conversion"].random(len(p)) < p

    # --- 6. réteg: rendelés ---
    o_cust = touches["customer"][konvertal]
    o_day = touches["day"][konvertal]
    alap_ertek = gen["orders"].lognormal(np.log(cfg.aov_median_huf), cfg.aov_sigma,
                                         size=len(o_cust))
    o_ertek = np.round(alap_ertek * pop.aov_factor[o_cust], 0)

    # `touch`: a rendelést adó session indexe a touches-ban. Nem sorsol semmit —
    # az emit.py ebből tudja, melyik session végére kerüljön a purchase esemény.
    orders = {"customer": o_cust, "day": o_day, "value_huf": o_ertek,
              "touch": np.flatnonzero(konvertal)}

    return World(napok, spend, megfigyelt, touches, orders, pop)


def _journey_strength(cfg: WorldConfig, touches: dict) -> np.ndarray:
    """Hány (súlyozott) érintés érte a vásárlót az elmúlt lookback_days napban,
    az AKTUÁLIS érintést is beleértve. A journey ereje, nem a session-é."""
    n = len(touches["day"])
    ki = np.zeros(n)
    # a touches nap szerint rendezett; vásárlónként csúszó ablak
    utolsok: dict[int, list[int]] = {}
    for i in range(n):
        c = int(touches["customer"][i])
        d = int(touches["day"][i])
        sor = utolsok.setdefault(c, [])
        while sor and sor[0] < d - cfg.lookback_days:
            sor.pop(0)
        sor.append(d)
        ki[i] = float(np.sqrt(len(sor)))   # csökkenő hozadék a journey hosszán is
    return ki

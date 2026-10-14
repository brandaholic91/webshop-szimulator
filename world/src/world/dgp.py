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
    affinity: np.ndarray      # (n, 6) csatorna-affinitás × aktivitás, ALL_SLUGS sorrendben
    churn_day: np.ndarray     # (n,) int, ettől a naptól nem kap érintést; túlmehet az ablakon
    arrival_day: np.ndarray   # (n,) int, ettől a naptól kaphat érintést (0 = az elején jelen van)
    activity: np.ndarray      # (n,) aktivitás-szorzó; az affinity már tartalmazza


def build_population(cfg: WorldConfig, gen: np.random.Generator,
                     life: np.random.Generator) -> Population:
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
    affinity = alap_aff * np.exp(gen.normal(0.0, cfg.affinity_sigma, size=(n, 6)))

    # Az élet a `lifetime` streamből jön (26. és 58. döntés): érkezés, élettartam,
    # aktivitás, EBBEN a sorrendben. A stream nincs a VALTOZO listán, tehát minden
    # replikában és minden ellentényes világban ugyanazok a vevők érkeznek és tűnnek el.
    # Az érkezés szándékosan nem függ a hirdetéstől: különben a nullázott világban más
    # vevők volnának, és az inkrementalitás definíciója változna.
    kezdo = life.random(n) < cfg.initial_share
    arrival_day = np.where(kezdo, 0, life.integers(1, cfg.n_days, size=n))
    hazard = np.array([s.churn_hazard_daily for s in cfg.segments])[seg]
    # + 1: az érkezése napján mindenki él
    churn_day = arrival_day + 1 + life.exponential(1.0 / hazard).astype(int)
    # kevesebb, aktívabb vevőre koncentrálja a sessionöket: ettől lesz visszatérő vásárló
    activity = np.exp(life.normal(0.0, cfg.activity_sigma, size=n))

    return Population(seg, propensity, aov_factor, affinity * activity[:, None],
                      churn_day, arrival_day, activity)


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

    Havi budget-lépcsők CSATORNÁNKÉNT külön húzva (a három hirdetési fiókot nem egy
    kéz állítja), napi zaj, kézzel felsorolt kampányszünetek, és ugyanaz a szezonális
    nyomás, ami a keresletet mozgatja. A szezon miatt a költés és a bevétel KORRELÁLT:
    ez a naiv regresszió csapdája. A csatornák egymástól viszont függetlenül mozognak,
    különben a hatásuk nem volna szétválasztható (58. döntés).
    """
    napok = cfg.days
    n = len(napok)
    szez = seasonality(cfg)

    # havi budget-szorzó: hónaponként és csatornánként egy húzás, a hónap minden napjára ugyanaz
    honap_kulcs = np.array([d.year * 12 + d.month for d in napok])
    egyedi, honap_idx = np.unique(honap_kulcs, return_inverse=True)
    havi = gen.lognormal(0.0, cfg.spend_monthly_sigma, size=(len(egyedi), len(PAID_SLUGS)))
    havi_szorzo = havi[honap_idx]                                   # (n, 3)

    ki = np.zeros((n, len(PAID_SLUGS)))
    for j, slug in enumerate(PAID_SLUGS):
        ch = cfg.channel(slug)
        napi_zaj = gen.lognormal(0.0, 0.10, size=n)
        ki[:, j] = ch.daily_base_huf * havi_szorzo[:, j] * szez * napi_zaj
    for p in cfg.pauses:
        szunet = np.array([p.first <= d <= p.last for d in napok])
        ki[szunet, PAID_SLUGS.index(p.slug)] = 0.0
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

    pop = build_population(cfg, gen["population"], gen["lifetime"])
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
            elo_maszk = (pop.arrival_day <= d) & (pop.churn_day > d)
            suly = np.where(elo_maszk, suly_oszlop, 0.0)
            osszeg = suly.sum()
            if osszeg <= 0:
                continue
            valasztott = _sorsol(tg, suly / osszeg, k)
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


def _sorsol(gen: np.random.Generator, p: np.ndarray, k: int) -> np.ndarray:
    """k index a p súlyok szerint, visszatevéssel. Bitre ugyanazt adja, és a streamet
    is ugyanott hagyja, mint a gen.choice(len(p), size=k, p=p): kumulált súly, k
    egyenletes szám, bináris keresés. Ami kimarad, az a choice hívásonkénti
    súly-ellenőrzése; a run() naponta és csatornánként hívja, ott ez volt az idő fele.
    Az egyezést a tests/test_dgp.py őrzi (egy numpy-frissítés után is)."""
    cdf = np.cumsum(p)
    cdf /= cdf[-1]
    return cdf.searchsorted(gen.random(k), side="right")


def _journey_strength(cfg: WorldConfig, touches: dict) -> np.ndarray:
    """Hány (súlyozott) érintés érte a vásárlót az elmúlt lookback_days napban,
    az AKTUÁLIS érintést is beleértve. A journey ereje, nem a session-é.

    Nem sorsol. Vektoros: az érintések vásárló szerint rendezve (azon belül marad a
    nap szerinti sorrend), és minden érintésnél bináris keresés adja az ablak elejét;
    a darabszám a két sorszám különbsége. A soronkénti, kézzel követhető alak a
    tests/test_dgp.py-ban áll referenciának."""
    c, d = touches["customer"].astype(np.int64), touches["day"].astype(np.int64)
    rend = np.argsort(c, kind="stable")
    # egy kulcs = (vásárló, nap); M elég nagy, hogy az ablak eleje ne lógjon át az
    # előző vásárló kulcsai közé
    M = cfg.n_days + cfg.lookback_days + 1
    kulcs = c[rend] * M + d[rend] + cfg.lookback_days
    elso = np.searchsorted(kulcs, kulcs - cfg.lookback_days, side="left")
    ki = np.empty(len(c))
    ki[rend] = np.sqrt(np.arange(len(c)) - elso + 1)   # csökkenő hozadék a journey hosszán is
    return ki

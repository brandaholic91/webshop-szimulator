"""A világ minden paramétere. Egy fájl elolvasásával meg kell érteni a bolt alakját.

A számok kalibrációs CÉLOKRA vannak hangolva (lásd a terv Global Constraints tábláját,
és a tests/test_calibration.py-t) — nem önmagukban jelentenek valamit.
"""
from dataclasses import dataclass, replace
from datetime import date, timedelta

SEED = 20260827
START = date(2023, 1, 1)
END = date(2025, 12, 31)

# 'paid' = van valódi napi költés-idősora, NEM az, hogy hirdetést vásárolunk:
# az Árukereső CPC-alapú listázás (feed + ajánlat + kiemelés), a plafonját a
# kategória forgalma szabja meg, nem a költhető keret. Ezért a legrövidebb az
# adstockja és a legmeredekebb a szaturációja.
PAID_SLUGS = ("google_ads", "meta_ads", "arukereso")
ALL_SLUGS = ("google_ads", "meta_ads", "arukereso", "organic", "direct", "email")


@dataclass(frozen=True)
class Channel:
    slug: str
    kind: str                  # 'paid' | 'unpaid'
    daily_base_huf: float      # napi alapköltés (paid); unpaid-nél 0
    adstock_decay: float       # λ — geometrikus lecsengés
    half_saturation: float     # g — az adstockolt napi költés, ahol a válasz fele
    saturation_shape: float    # a — a Hill-görbe meredeksége
    base_share: float          # unpaid: a bázis-session hányad; paid: 0
    reach_scale: float         # paid: session/nap teljes telítettségnél
    capture_max: float = 0.0   # paid: a bázis-sessionök legfeljebb ekkora részét fogja el


@dataclass(frozen=True)
class Segment:
    slug: str
    share: float
    propensity: float          # log-odds eltolás a konverzióban
    aov_factor: float          # a kosárérték medián-szorzója
    churn_hazard_daily: float  # napi lemorzsolódási hazard az érkezéstől; 1/hazard az átlagos élettartam napban
    affinity: tuple[float, ...]  # 6 súly, ALL_SLUGS sorrendjében


@dataclass(frozen=True)
class Pause:
    """Kampányszünet: ezeken a napokon a csatorna költése nulla. Kézzel felsorolt, nem
    sorsolt (58. döntés): a lap rá tud mutatni, és az MMM-nek ez a legtisztább jel."""
    slug: str     # fizetett csatorna
    first: date   # az első nap költés nélkül
    last: date    # az utolsó (ő is szünet)


@dataclass(frozen=True)
class WorldConfig:
    seed: int
    start: date
    end: date
    channels: tuple[Channel, ...]
    segments: tuple[Segment, ...]
    n_customers: int
    base_sessions_start: float   # napi session-alap az első napon
    base_sessions_end: float     # …és az utolsón (lineáris trend)
    weekday_factor: tuple[float, ...]   # hétfő…vasárnap
    yearly_amplitude: float             # éves szinusz amplitúdója
    q4_boost: float                     # nov-dec extra szorzó
    black_friday_boost: float
    conversion_intercept: float         # log-odds
    touch_effect: float                 # egy szaturált érintés log-odds hozzájárulása
    lookback_days: int                  # meddig számít egy érintés a journey-ben
    aov_median_huf: float
    aov_sigma: float
    spend_monthly_sigma: float          # a havi budget-szorzó szórása (log), csatornánként külön húzva
    pauses: tuple[Pause, ...]           # kampányszünetek
    initial_share: float                # a vevők ekkora része a 0. napon már jelen van
    activity_sigma: float               # a vevőnkénti aktivitás-szorzó szórása (log)
    affinity_sigma: float               # a vevőnkénti csatorna-affinitás zaja (log)

    @property
    def n_days(self) -> int:
        return (self.end - self.start).days + 1

    @property
    def days(self) -> list[date]:
        return [self.start + timedelta(days=i) for i in range(self.n_days)]

    def channel(self, slug: str) -> Channel:
        for c in self.channels:
            if c.slug == slug:
                return c
        raise KeyError(slug)

    def zero_spend(self, slug: str) -> "WorldConfig":
        """Ellentényes világ: EGY fizetett csatorna költése nullán, minden más azonos."""
        if slug not in PAID_SLUGS:
            raise ValueError(f"csak fizetett csatorna nullázható: {slug}")
        return replace(
            self,
            channels=tuple(
                replace(c, daily_base_huf=0.0) if c.slug == slug else c
                for c in self.channels
            ),
        )


WORLD = WorldConfig(
    seed=SEED,
    start=START,
    end=END,
    channels=(
        Channel("google_ads", "paid", 12_300.0, 0.30, 20_000.0, 1.5, 0.0, 292.0, 0.209),
        Channel("meta_ads",   "paid",  9_560.0, 0.60, 16_000.0, 1.2, 0.0, 214.0, 0.032),
        Channel("arukereso",  "paid",  5_470.0, 0.15,  9_000.0, 2.0, 0.0, 134.0, 0.072),
        Channel("organic",  "unpaid", 0.0, 0.0, 0.0, 1.0, 0.54, 0.0),
        Channel("direct",   "unpaid", 0.0, 0.0, 0.0, 1.0, 0.31, 0.0),
        Channel("email",    "unpaid", 0.0, 0.0, 0.0, 1.0, 0.15, 0.0),
    ),
    segments=(
        Segment("alkalmi",     0.45, -0.35, 0.85, 1 / 1100, (0.5, 4.0, 0.15, 0.8, 0.5, 0.3)),
        Segment("arvadasz",    0.25, -0.10, 0.80, 1 / 1200, (1.5, 0.15, 5.0, 0.7, 0.5, 0.4)),
        Segment("markahu",     0.20,  0.55, 1.15, 1 / 2000, (0.4, 0.4, 0.2, 0.8, 2.5, 4.0)),
        Segment("nagykosaras", 0.10,  0.20, 2.10, 1 / 1500, (0.8, 0.5, 0.4, 3.5, 0.8, 0.5)),
    ),
    n_customers=30_000,
    base_sessions_start=569.0,
    base_sessions_end=733.0,
    weekday_factor=(1.10, 1.08, 1.04, 1.00, 0.94, 0.82, 0.92),
    yearly_amplitude=0.16,
    q4_boost=1.22,
    black_friday_boost=2.60,
    conversion_intercept=-5.73,
    touch_effect=0.42,
    lookback_days=30,
    aov_median_huf=12_300.0,
    aov_sigma=0.55,
    spend_monthly_sigma=0.20,
    pauses=(
        Pause("google_ads", date(2024, 2, 5), date(2024, 2, 25)),
        Pause("google_ads", date(2025, 6, 2), date(2025, 6, 15)),
        Pause("meta_ads",   date(2023, 6, 5), date(2023, 7, 2)),
        Pause("meta_ads",   date(2025, 3, 3), date(2025, 3, 16)),
        Pause("arukereso",  date(2024, 8, 5), date(2024, 8, 25)),
    ),
    initial_share=0.35,
    activity_sigma=1.00,
    affinity_sigma=0.20,
)


@dataclass(frozen=True)
class EmitConfig:
    """Az esemény-réteg paraméterei: mit lát a világból egy tracker (33. döntés).

    A tölcsér-arányok a NEM vásárló sessionökre vonatkoznak; a vásárlást a DGP
    már eldöntötte. Az összes esemény ~5,5 M-ra van hangolva (25. döntés) — a
    sávot a tests/test_emit.py őrzi, a fő hangoló a `browse_mean`.
    """
    second_device_share: float          # a vásárlók mekkora részének van 2. eszköze
    second_device_session_share: float  # nekik a sessionök mekkora része jön onnan
    consent_decline_rate: float         # eszközönként, egyszer és végleg
    duplicate_rate: float               # az elküldött események mekkora része megy kétszer
    p_browse: float                     # továbbmegy a landingről
    browse_mean: float                  # átlagos böngésző-esemény, ha továbbment (>= 1)
    view_item_share: float              # a böngésző-események mekkora része termékoldal
    p_cart: float                       # a böngészők mekkora része tesz kosárba
    p_checkout: float                   # a kosárba tevők mekkora része kezd fizetni
    n_products: int
    gap_min_s: int                      # két esemény közti legkisebb távolság, mp
    gap_mean_s: float                   # e fölött átlagosan ennyi, mp
    hour_weights: tuple[float, ...]     # 24 súly, 0..23 óra


EMIT = EmitConfig(
    second_device_share=0.35,
    second_device_session_share=0.30,
    consent_decline_rate=0.20,
    duplicate_rate=0.01,
    p_browse=0.65,
    browse_mean=5.7,
    view_item_share=0.5,
    p_cart=0.12,
    p_checkout=0.40,
    n_products=240,
    gap_min_s=4,
    gap_mean_s=45.0,
    hour_weights=(
        0.6, 0.3, 0.2, 0.2, 0.3, 0.6, 1.4, 2.6, 3.8, 4.6, 5.0, 5.2,
        5.4, 5.2, 5.0, 5.0, 5.2, 5.6, 6.4, 7.4, 8.0, 7.2, 4.6, 2.0,
    ),
)

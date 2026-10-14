"""Az igazság ellentényes újrafuttatásból jön (9. döntés).

Csábító lenne azt mondani, hogy a Meta hozzájárulása az, amit beírtunk a
configba. EZ HAMIS: szaturáció és bázis-kereslet mellett a beírt paraméter már
nem egyenlő a valódi inkrementális hozzájárulással.

    Futtasd le a világot ugyanazzal a seeddel, de a Meta költése nullán.
    A két világ bevétel-különbsége a Meta valódi inkrementalitása.

Ez a szimulált holdout — pontosan az, amit egy geo-lift teszt csinálna élesben.

Egyetlen ilyen különbség zajos: a nullázás a sorsolásokat is elmozdítja (rng.py),
és a szám csatornánként kb. 0,8 százalékpontot szór. Ezért az igazság REPLICATES
újrajátszás ÁTLAGA (53. döntés): ugyanaz a populáció és költés, más sorsolás,
mindegyiken 1 teljes + 3 ellentényes világ.

A 24. döntés miatt ez a modul ÍR két fájlt ugyanabból a memóriában lévő
eredményből: a truth.json-t a szerződésnek, és a megjelenítési JSON-okat a
lapnak. Senki nem olvassa újra a truth.json-t — azt csak a compare.py teszi.

A segments műszer igazsága a vásárlónkénti szegmens-címke (57. döntés). A
populáció-stream a replikákban nem változik (rng.py), ezért ez nem átlag, hanem
egyetlen kiosztás, customer_key szerint — ugyanaz a kulcs, amit a pipeline lát.
"""
import json
import os
from multiprocessing import Pool
from pathlib import Path

import numpy as np

from .config import ALL_SLUGS, PAID_SLUGS, WORLD, WorldConfig
from .dgp import World, build_population, run, seasonality
from .emit import customer_key
from .response import saturate
from .rng import replica_streams, streams

OUT = Path(__file__).resolve().parents[2] / "out"

# A TS-implementáció önellenőrzési pontjai (27. döntés). Ft/nap adstockolt költés.
REF_PONTOK = [0, 2_000, 5_000, 10_000, 20_000, 40_000, 80_000]

REPLICATES = 40   # ennyi újrajátszás átlaga az igazság; a noise.py ugyanezekből méri a szórást

# A replikákat futtató Pool mérete: a logikai magok fele, azaz hyperthreading mellett a
# fizikai magok. Több processzel a világfuttatás LASSABB: 6 magos, 12 szálas gépen mérve
# 12 processz 1,0, 6 processz 1,5 világ/s. Csak a sebességet érinti, az eredményt nem.
WORKERS = max(1, (os.cpu_count() or 2) // 2)


def _heti_bevetel(w: World) -> list[float]:
    het = w.orders["day"] // 7
    n_het = (len(w.days) + 6) // 7
    return np.bincount(het, weights=w.orders["value_huf"], minlength=n_het).tolist()


def incrementality(cfg: WorldConfig, rep: int | None = None) -> tuple[dict[str, dict], list[float]]:
    """EGY futás: csatornánként egy ellentényes világ. Összesen 1 + 3 világ.

    `rep`: None a világ saját streamjeivel fut, szám a `rep`. replikáéval.

    Visszaad: (csatornánkénti számok, a TELJES világ heti bevétele).
    A kettő azért külön, hogy a csatorna-dict minden eleme ugyanolyan alakú
    legyen — különben minden rajta iteráló hívó és teszt elhasalna egy
    kilógó kulcson.
    """
    def gen():
        return None if rep is None else replica_streams(cfg.seed, rep)

    teljes = run(cfg, gen())
    teljes_bevetel = float(teljes.orders["value_huf"].sum())

    ki = {}
    for j, slug in enumerate(PAID_SLUGS):
        nelkule = run(cfg.zero_spend(slug), gen())
        ki[slug] = _szamok(
            koltes=float(teljes.spend[:, j].sum()),
            teljes_bevetel=teljes_bevetel,
            nelkule_bevetel=float(nelkule.orders["value_huf"].sum()),
            nelkule_heti=_heti_bevetel(nelkule),
        )
    return ki, _heti_bevetel(teljes)


def _szamok(koltes: float, teljes_bevetel: float, nelkule_bevetel: float,
            nelkule_heti: list[float]) -> dict:
    delta = teljes_bevetel - nelkule_bevetel
    return {
        "spend_huf": koltes,
        "total_revenue_huf": teljes_bevetel,
        "counterfactual_revenue_huf": nelkule_bevetel,
        "incremental_revenue_huf": delta,
        "true_roas": delta / koltes if koltes else 0.0,
        "share_of_revenue": delta / teljes_bevetel,
        "weekly_revenue_counterfactual": nelkule_heti,
    }


def mean_incrementality(cfg: WorldConfig,
                        replicates: int = REPLICATES) -> tuple[dict[str, dict], list[float]]:
    """Az igazság: `replicates` újrajátszás átlaga (53. döntés). Alakja az incrementality()-é.

    A bevételeket átlagolja (a teljes és az ellentényes világét, hetente is), a
    ROAS és az arány az átlagokból jön. Így a fájlon belül minden azonosság áll:
    inkrementális = teljes − ellentényes, arány = inkrementális / teljes.
    A költés minden replikán ugyanaz.
    """
    with Pool(WORKERS) as pool:
        futasok = pool.starmap(incrementality, [(cfg, r) for r in range(1, replicates + 1)])

    def atlag(ertekek):
        return np.mean(list(ertekek), axis=0)

    ki = {}
    for slug in PAID_SLUGS:
        csatorna = [inc[slug] for inc, _ in futasok]
        ki[slug] = _szamok(
            koltes=csatorna[0]["spend_huf"],
            teljes_bevetel=float(atlag(c["total_revenue_huf"] for c in csatorna)),
            nelkule_bevetel=float(atlag(c["counterfactual_revenue_huf"] for c in csatorna)),
            nelkule_heti=atlag(c["weekly_revenue_counterfactual"] for c in csatorna).tolist(),
        )
    return ki, atlag(heti for _, heti in futasok).tolist()


def segment_assignment(cfg: WorldConfig) -> dict[str, str]:
    """Vásárlónként a latens szegmens slugja, customer_key szerint (57. döntés).

    Ugyanaz a populáció, amit a run() épít: a population stream a seedből jön, és a
    replikák nem nyúlnak hozzá. A kulcs az emit.customer_key uuid5-je, amit a
    pipeline identity_links.customer_key-ként lát; a compare így névre illeszt.
    """
    s = streams(cfg.seed)
    pop = build_population(cfg, s["population"], s["lifetime"])
    slugok = [s.slug for s in cfg.segments]
    return {customer_key(cfg.seed, i): slugok[int(idx)] for i, idx in enumerate(pop.segment_idx)}


def channel_audience(cfg: WorldConfig, w: World) -> dict[str, dict]:
    """Fizetett csatornánként: hány sessiont hozott a hirdetés, és kik kapták.

    A session a csatorna saját sessionje (base_channel), az elfogás előtt: az
    elfogott organic és direct látogató hirdetés nélkül is megjött volna. A
    közönség a sessionök szegmens-aránya, a cfg.segments sorrendjében. A lap ebből
    mutatja meg, miért ér többet egy csatorna látogatása, mint a másiké.
    """
    ki = {}
    for s in PAID_SLUGS:
        sajat = w.touches["base_channel"] == ALL_SLUGS.index(s)
        szegmens = w.population.segment_idx[w.touches["customer"][sajat]]
        db = np.bincount(szegmens, minlength=len(cfg.segments))
        ki[s] = {"paid_sessions": int(sajat.sum()),
                 "audience": [float(x) for x in db / max(int(db.sum()), 1)]}
    return ki


def build_truth(cfg: WorldConfig, replicates: int = REPLICATES) -> tuple[dict, dict]:
    """(truth.json tartalma, a lapnak szánt megjelenítési dict)."""
    inc, teljes_heti = mean_incrementality(cfg, replicates)

    truth = {
        "schema_version": 1,
        "seed": cfg.seed,
        "replicates": replicates,
        "adstock": {s: cfg.channel(s).adstock_decay for s in PAID_SLUGS},
        "saturation": {
            s: {
                "half_saturation_huf": cfg.channel(s).half_saturation,
                "shape": cfg.channel(s).saturation_shape,
            }
            for s in PAID_SLUGS
        },
        "base_demand": {
            "sessions_start": cfg.base_sessions_start,
            "sessions_end": cfg.base_sessions_end,
            "weekday_factor": list(cfg.weekday_factor),
            "yearly_amplitude": cfg.yearly_amplitude,
            "q4_boost": cfg.q4_boost,
        },
        "segments": {
            s.slug: {"share": s.share, "aov_factor": s.aov_factor,
                     "churn_hazard_daily": s.churn_hazard_daily}
            for s in cfg.segments
        },
        "segment_assignment": segment_assignment(cfg),
        "incrementality": {
            s: {k: v for k, v in inc[s].items() if k != "weekly_revenue_counterfactual"}
            for s in PAID_SLUGS
        },
    }

    megjelenites = {
        "schema_version": 1,
        "channels": list(PAID_SLUGS),
        "weekly_revenue": teljes_heti,
        "counterfactual": {
            s: {
                "weekly_revenue": inc[s]["weekly_revenue_counterfactual"],
                "spend_huf": inc[s]["spend_huf"],
                "incremental_revenue_huf": inc[s]["incremental_revenue_huf"],
                "true_roas": inc[s]["true_roas"],
                "share_of_revenue": inc[s]["share_of_revenue"],
            }
            for s in PAID_SLUGS
        },
    }
    return truth, megjelenites


def _write(nev: str, adat: dict) -> None:
    OUT.mkdir(exist_ok=True)
    (OUT / nev).write_text(json.dumps(adat, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  {nev}")


def main() -> None:
    cfg = WORLD
    print(f"{REPLICATES} újrajátszás, mindegyik 1 teljes + 3 ellentényes világ (kb. 3 perc)…")
    truth, megjelenites = build_truth(cfg)
    w = run(cfg)
    szez = seasonality(cfg)

    _write("truth.json", truth)
    _write("world_incrementality.json", megjelenites)
    _write("world_spend.json", {
        "start": cfg.start.isoformat(),
        "channels": list(PAID_SLUGS),
        "daily_huf": w.spend.astype(int).T.tolist(),
    })
    kozonseg = channel_audience(cfg, w)
    _write("world_response.json", {
        "segments": [s.slug for s in cfg.segments],
        "channels": [
            {
                "slug": s,
                "adstock_decay": cfg.channel(s).adstock_decay,
                "half_saturation_huf": cfg.channel(s).half_saturation,
                "shape": cfg.channel(s).saturation_shape,
                "reach_scale": cfg.channel(s).reach_scale,
                # A bolt egy futásából (amit a többi elemzés mér), nem a replikák átlagából.
                **kozonseg[s],
            }
            for s in PAID_SLUGS
        ],
        # A TS-implementáció önellenőrzése (27. döntés): a valódi paraméterek
        # mellett a böngészőben számolt görbének ezekre a pontokra kell esnie.
        "reference": {
            s: {
                "spend_huf": REF_PONTOK,
                "saturated": [
                    float(x)
                    for x in saturate(
                        np.array(REF_PONTOK, dtype=float),
                        cfg.channel(s).half_saturation,
                        cfg.channel(s).saturation_shape,
                    )
                ],
            }
            for s in PAID_SLUGS
        },
    })
    _write("world_outcome.json", {
        "start": cfg.start.isoformat(),
        # A bolt maga EGY futás (ezt méri a pipeline), nem az újrajátszások átlaga.
        "weekly_revenue_huf": [int(x) for x in _heti_bevetel(w)],
        "weekly_orders": np.bincount(w.orders["day"] // 7,
                                     minlength=(cfg.n_days + 6) // 7).tolist(),
        # Mindhárom heti sorozat UGYANANNYI pontot ad (157), különben a lap
        # két ábrája más x-tengelyen futna.
        "weekly_sessions": np.bincount(
            np.arange(cfg.n_days) // 7,
            weights=w.sessions_by_channel.sum(axis=1),
            minlength=(cfg.n_days + 6) // 7,
        ).astype(int).tolist(),
        "channels": list(ALL_SLUGS),
        "daily_seasonality": [round(float(x), 4) for x in szez],
    })
    print("kész.")


if __name__ == "__main__":
    main()

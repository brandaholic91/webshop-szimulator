"""Az igazság ellentényes újrafuttatásból jön (9. döntés).

Csábító lenne azt mondani, hogy a Meta hozzájárulása az, amit beírtunk a
configba. EZ HAMIS: szaturáció és bázis-kereslet mellett a beírt paraméter már
nem egyenlő a valódi inkrementális hozzájárulással.

    Futtasd le a világot ugyanazzal a seeddel, de a Meta költése nullán.
    A két világ bevétel-különbsége a Meta valódi inkrementalitása.

Ez a szimulált holdout — pontosan az, amit egy geo-lift teszt csinálna élesben.

A 24. döntés miatt ez a modul ÍR két fájlt ugyanabból a memóriában lévő
eredményből: a truth.json-t a szerződésnek, és a megjelenítési JSON-okat a
lapnak. Senki nem olvassa újra a truth.json-t — azt csak a compare.py teszi.
"""
import json
from pathlib import Path

import numpy as np

from .config import ALL_SLUGS, PAID_SLUGS, WORLD, WorldConfig
from .dgp import World, run, seasonality
from .response import saturate

OUT = Path(__file__).resolve().parents[2] / "out"

# A TS-implementáció önellenőrzési pontjai (27. döntés). Ft/nap adstockolt költés.
REF_PONTOK = [0, 2_000, 5_000, 10_000, 20_000, 40_000, 80_000]


def _heti_bevetel(w: World) -> list[float]:
    het = w.orders["day"] // 7
    n_het = (len(w.days) + 6) // 7
    return np.bincount(het, weights=w.orders["value_huf"], minlength=n_het).tolist()


def incrementality(cfg: WorldConfig) -> tuple[dict[str, dict], list[float]]:
    """Csatornánként egy ellentényes futás. Összesen 1 + 3 világ.

    Visszaad: (csatornánkénti igazság, a TELJES világ heti bevétele).
    A kettő azért külön, hogy a csatorna-dict minden eleme ugyanolyan alakú
    legyen — különben minden rajta iteráló hívó és teszt elhasalna egy
    kilógó kulcson.
    """
    teljes = run(cfg)
    teljes_bevetel = float(teljes.orders["value_huf"].sum())

    ki = {}
    for j, slug in enumerate(PAID_SLUGS):
        nelkule = run(cfg.zero_spend(slug))
        nelkule_bevetel = float(nelkule.orders["value_huf"].sum())
        koltes = float(teljes.spend[:, j].sum())
        delta = teljes_bevetel - nelkule_bevetel
        ki[slug] = {
            "spend_huf": koltes,
            "total_revenue_huf": teljes_bevetel,
            "counterfactual_revenue_huf": nelkule_bevetel,
            "incremental_revenue_huf": delta,
            "true_roas": delta / koltes if koltes else 0.0,
            "share_of_revenue": delta / teljes_bevetel,
            "weekly_revenue_counterfactual": _heti_bevetel(nelkule),
        }
    return ki, _heti_bevetel(teljes)


def build_truth(cfg: WorldConfig) -> tuple[dict, dict]:
    """(truth.json tartalma, a lapnak szánt megjelenítési dict)."""
    inc, teljes_heti = incrementality(cfg)

    truth = {
        "schema_version": 1,
        "seed": cfg.seed,
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
    print("A világ futtatása (1 teljes + 3 ellentényes)…")
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
    _write("world_response.json", {
        "channels": [
            {
                "slug": s,
                "adstock_decay": cfg.channel(s).adstock_decay,
                "half_saturation_huf": cfg.channel(s).half_saturation,
                "shape": cfg.channel(s).saturation_shape,
                "reach_scale": cfg.channel(s).reach_scale,
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
        "weekly_revenue_huf": [int(x) for x in megjelenites["weekly_revenue"]],
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

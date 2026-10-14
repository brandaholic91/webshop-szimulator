"""Mekkora a véletlen zaj az inkrementalitás számain -> out/world_noise.json.

    uv run python -m world.noise      (kb. 3 perc, nyolc magon)

Az igazság két világ különbsége (9. döntés), és a nullázás a `touch`,
`conversion` és `orders` réteg sorsolásait is elmozdítja (lásd rng.py). Hogy ez
mekkora bizonytalanság, azt nem lehet egy futásból látni. Ezért itt a világ
REPLICATES-szer újrafut: a populáció és a költés ugyanaz marad, a többi réteg
új streamet kap, és minden replikán ugyanaz a számítás megy, mint a truth.py-ban.
A kimenet a három mérték SZÓRÁSA csatornánként.

Az igazság-fájlt nem olvassa és nem írja. A lap száma ugyanezeknek a replikáknak
az ÁTLAGA, azt a truth.py számolja (53. döntés); ez a modul a szórást adja mellé.
"""
import json
from multiprocessing import Pool

import numpy as np

from .config import PAID_SLUGS, WORLD
from .dgp import run
from .rng import replica_streams
from .truth import OUT, REPLICATES, WORKERS

def replica(rep: int) -> dict[str, dict[str, float]]:
    """Egy replika: csatornánként inkrementális bevétel, ROAS és bevétel-arány."""
    teljes = run(WORLD, replica_streams(WORLD.seed, rep))
    bevetel = float(teljes.orders["value_huf"].sum())
    ki = {}
    for j, slug in enumerate(PAID_SLUGS):
        nelkule = run(WORLD.zero_spend(slug), replica_streams(WORLD.seed, rep))
        delta = bevetel - float(nelkule.orders["value_huf"].sum())
        ki[slug] = {
            "incremental_revenue_huf": delta,
            "true_roas": delta / float(teljes.spend[:, j].sum()),
            "share_of_revenue": delta / bevetel,
        }
    return ki


def main() -> None:
    print(f"{REPLICATES} replika, mindegyik 1 teljes + 3 ellentényes világ…")
    with Pool(WORKERS) as pool:
        replikak = pool.map(replica, range(1, REPLICATES + 1))

    def szoras(slug: str, kulcs: str) -> float:
        return float(np.std([r[slug][kulcs] for r in replikak], ddof=1))

    adat = {
        "schema_version": 1,
        "replicates": REPLICATES,
        "sd": {
            slug: {
                "incremental_revenue_huf": round(szoras(slug, "incremental_revenue_huf")),
                "true_roas": round(szoras(slug, "true_roas"), 4),
                "share_of_revenue": round(szoras(slug, "share_of_revenue"), 5),
            }
            for slug in PAID_SLUGS
        },
    }
    (OUT / "world_noise.json").write_text(
        json.dumps(adat, ensure_ascii=False, indent=1), encoding="utf-8")
    for slug, sd in adat["sd"].items():
        print(f"  {slug:12s} ±{sd['incremental_revenue_huf'] / 1e6:.2f} M Ft"
              f"  ROAS ±{sd['true_roas']:.2f}  arány ±{100 * sd['share_of_revenue']:.2f} pp")
    print("  world_noise.json\nkész.")


if __name__ == "__main__":
    main()

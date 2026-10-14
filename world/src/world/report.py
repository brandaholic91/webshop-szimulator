"""Kalibrációs riport: a világ megfigyelhető mérőszámai egy táblában.

    uv run python -m world.report

A paramétereket nem lehet előre kitalálni; megfigyelhető CÉLOKAT lehet kitűzni,
és a config.py konstansait azokra hangolni. Ez a modul mutatja, hol tartasz.
"""
import numpy as np

from .config import PAID_SLUGS, WORLD, WorldConfig
from .dgp import World, run, seasonality


def _heti(x: np.ndarray) -> np.ndarray:
    """Napi sorból heti összeg, csak a teljes hetekre (az utolsó csonka hét kimarad)."""
    n_het = len(x) // 7
    return x[:n_het * 7].reshape(n_het, 7, *x.shape[1:]).sum(axis=1)


def metrics(w: World, cfg: WorldConfig = WORLD) -> dict[str, float]:
    n_nap = len(w.days)
    n_session = len(w.touches["day"])
    n_rendeles = len(w.orders["day"])
    bevetel = float(w.orders["value_huf"].sum())
    koltes = float(w.spend.sum())
    egyedi, db = np.unique(w.orders["customer"], return_counts=True)
    megfigyelt, eredeti = w.touches["channel"], w.touches["base_channel"]
    return {
        "nap": n_nap,
        "session_per_nap": n_session / n_nap,
        "konverzios_rata": n_rendeles / n_session,
        "rendeles": n_rendeles,
        "aov_huf": bevetel / n_rendeles,
        "bevetel_huf": bevetel,
        "koltes_huf": koltes,
        "koltes_bevetel_arany": koltes / bevetel,
        "visszatero_arany": float((db > 1).sum() / len(egyedi)),
        "fizetett_session_arany": float(w.sessions_by_channel[:, :3].sum()
                                        / w.sessions_by_channel.sum()),
        # a csatorna megfigyelt sessionjeinek mekkora része elfogott (37. döntés)
        **{
            f"elfogott_arany_{slug}": float(((megfigyelt == j) & (eredeti != j)).sum()
                                            / (megfigyelt == j).sum())
            for j, slug in enumerate(PAID_SLUGS)
        },
        # lecke-sávok (58. döntés): a heti költés a csatornák közt és a szezonhoz mérve
        "koltes_paros_korrelacio_max": float(max(
            np.corrcoef(_heti(w.spend).T)[i, j] for i in range(3) for j in range(i + 1, 3))),
        "koltes_szezon_korrelacio_min": float(min(
            np.corrcoef(_heti(w.spend)[:, j], _heti(seasonality(cfg)))[0, 1] for j in range(3))),
        "rendeles_per_vasarlo": n_rendeles / len(egyedi),
        # az első évben érkezettek (a 0. napon jelen lévőkkel) mekkora része tűnt el a végére
        "elso_ev_lemorzsolodott_arany": float(
            (w.population.churn_day[w.population.arrival_day < 365] < n_nap).mean()),
    }


if __name__ == "__main__":
    for kulcs, ertek in metrics(run(WORLD)).items():
        print(f"{kulcs:28s} {ertek:>16,.4f}")

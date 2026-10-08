"""AZ EGYETLEN MODUL, AMI A truth.json-T OLVASSA (10. döntés, 1. nem-tárgyalható szabály).

Egy modell soha nem hívhatja ezt illesztés közben — csak UTÁNA, a becslés
összevetésére. Ha egy modell látja az igazságot, minden "becslés vs. igazság"
sor hazugság lesz, és NEM FOG KIDERÜLNI: az eredmény csak jobb lesz tőle.
"""
import json
from pathlib import Path

from .config import ALL_SLUGS, PAID_SLUGS

TRUTH = Path(__file__).resolve().parents[2] / "out" / "truth.json"


def load_truth() -> dict:
    return json.loads(TRUTH.read_text(encoding="utf-8"))


def attribution_truth(truth: dict | None = None) -> dict[str, dict[str, float]]:
    """A három fizetett csatorna igazsága a két összevetési mértékben."""
    inc = (truth or load_truth())["incrementality"]
    return {s: {"share": inc[s]["share_of_revenue"], "roas": inc[s]["true_roas"]}
            for s in PAID_SLUGS}


def compare_attribution(
    revenue_by_model: dict[str, dict[str, float]],
    pipeline_revenue_huf: float,
    total_revenue_huf: float,
    spend_huf: dict[str, float],
    truth: dict[str, dict[str, float]],
) -> dict:
    """A modellek kiosztott bevételéből arány, ROAS és eltérés. A becslés UTÁN hívandó.

    revenue_by_model: {modell: {csatorna: kiosztott bevétel}} egy lookback-ablakra.
    truth: az attribution_truth() kimenete.

    Arány = kiosztott bevétel / a pipeline teljes bevétele (ALL_SLUGS sorrendben).
    ROAS  = arány × a bolt teljes bevétele / a csatorna költése (PAID_SLUGS sorrendben).
    Eltérés = |arány − igazság| átlaga a három fizetett csatornán, százalékpontban.
    """
    share, roas, error = {}, {}, {}
    for modell, bevetel in revenue_by_model.items():
        arany = {s: bevetel.get(s, 0.0) / pipeline_revenue_huf for s in ALL_SLUGS}
        share[modell] = [arany[s] for s in ALL_SLUGS]
        roas[modell] = [arany[s] * total_revenue_huf / spend_huf[s] for s in PAID_SLUGS]
        error[modell] = 100 * sum(abs(arany[s] - truth[s]["share"])
                                  for s in PAID_SLUGS) / len(PAID_SLUGS)
    return {"share": share, "roas": roas, "mean_abs_error_pp": error}

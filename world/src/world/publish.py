"""out/ -> public/data/. A 'mit számolunk' és a 'mit szállítunk a webre' két
különböző kérdés, ezért van külön modulja.

A truth.json NEM szerepel a listán, és ez nem elnézés: a 24. döntés szerint a
lapnak szánt igazság-számokat a truth.py külön, megjelenítési JSON-ba írja.

Az events_daily.json sincs a listán: egyik oldal sem olvassa.
"""
import shutil
from pathlib import Path

from .truth import OUT

PUBLIC_DIR = Path(__file__).resolve().parents[3] / "public" / "data"

PUBLIC_FILES = (
    "world_spend.json",
    "world_response.json",
    "world_outcome.json",
    "world_incrementality.json",
    "world_noise.json",
    "events_ledger.json",
    "events_sample.json",
    "events_emitted.json",
    "attribution.json",
)


def publish() -> list[Path]:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    utak = []
    for nev in PUBLIC_FILES:
        cel = PUBLIC_DIR / nev
        shutil.copyfile(OUT / nev, cel)
        utak.append(cel)
    return utak


if __name__ == "__main__":
    for u in publish():
        print(f"  {u.relative_to(PUBLIC_DIR.parents[1])}  {u.stat().st_size:,} B")

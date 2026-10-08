"""emit -> HTTP -> a helyi világ-instance.

    uv run python -m world.load            # a teljes világ
    uv run python -m world.load --days 30  # próbafutás az első 30 napon

Valódi HTTP-n megy (11. döntés), a collector batch-végpontjára, 1000-es
kötegekben. Újrafuttatható: az események azonosítója a seedből jön, tehát ami
egyszer bement, az másodszorra duplikátumként pattan le.
"""
import argparse
import os
import time
from dataclasses import replace
from datetime import timedelta
from itertools import islice
from typing import Iterable, Iterator

import httpx

from .config import EMIT, WORLD, WorldConfig
from .dgp import run
from .emit import events
from .local import require_local

COLLECTOR_URL = os.environ.get("WORLD_COLLECTOR_URL", "http://127.0.0.1:18080")
BATCH = 1000


def config_for(days: int | None) -> WorldConfig:
    """A próbafutás világa: ugyanaz a seed, csak az első `days` nap."""
    if days is None:
        return WORLD
    if not 1 <= days <= WORLD.n_days:
        raise ValueError(f"--days 1 és {WORLD.n_days} között lehet, ez: {days}")
    return replace(WORLD, end=WORLD.start + timedelta(days=days - 1))


def batches(esemenyek: Iterable[dict], meret: int = BATCH) -> Iterator[list[dict]]:
    it = iter(esemenyek)
    while koteg := list(islice(it, meret)):
        yield koteg


def send(client: httpx.Client, esemenyek: Iterable[dict]) -> dict:
    """Elküldi a consentet adott eseményeket. A többit csak megszámolja:
    a tracker.js sem küld semmit consent nélkül."""
    ki = {"withheld": 0, "posted": 0, "accepted": 0, "duplicates": 0}

    def kuldheto():
        for e in esemenyek:
            if e["consent_analytics"]:
                yield e
            else:
                ki["withheld"] += 1

    for n, koteg in enumerate(batches(kuldheto()), start=1):
        valasz = client.post("/v1/events/batch", json={"events": koteg})
        if valasz.status_code != 202:
            # 422 = a mi hibánk (rossz esemény), nem átmeneti hálózati gond. Más
            # hibánál is megállunk: a betöltés újrafuttatható, a folytatás nem ér
            # annyit, mint egy tiszta hibaüzenet.
            raise RuntimeError(
                f"a(z) {n}. köteg {valasz.status_code}-t kapott, megállok: {valasz.text[:400]}"
            )
        adat = valasz.json()
        if adat["consent_rejected"]:
            raise RuntimeError("a collector consent nélküli eseményt kapott: ez hiba a load.py-ban")
        ki["posted"] += len(koteg)
        ki["accepted"] += adat["accepted"]
        ki["duplicates"] += adat["duplicates"]
        if n % 200 == 0:
            print(f"  {ki['posted']:>9,} elküldve")
    return ki


def wait_for_worker(client: httpx.Client, timeout_s: float = 3600.0, poll_s: float = 2.0) -> dict:
    """Megvárja, amíg a worker a raw_events minden sorával végzett."""
    hatarido = time.monotonic() + timeout_s
    while True:
        a = client.get("/api/stats/health").json()
        if a["processed"] + a["failed"] >= a["ingested"]:
            return a
        if time.monotonic() > hatarido:
            raise TimeoutError(f"a worker nem végzett {timeout_s:.0f} s alatt: {a}")
        time.sleep(poll_s)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=None)
    days = ap.parse_args().days

    cel = require_local(COLLECTOR_URL)          # mielőtt bármi elindulna
    cfg = config_for(days)
    print(f"A világ futtatása ({cfg.n_days} nap)…")
    vilag = run(cfg)

    with httpx.Client(base_url=cel, timeout=120.0, trust_env=False) as client:
        client.get("/health").raise_for_status()
        print(f"Betöltés ide: {cel}")
        t0 = time.monotonic()
        ki = send(client, events(vilag, cfg, EMIT))
        print(f"  elküldve {ki['posted']:,} ({time.monotonic() - t0:.0f} s): "
              f"{ki['accepted']:,} új, {ki['duplicates']:,} duplikátum; "
              f"consent miatt visszatartva {ki['withheld']:,}")
        print("Várakozás a workerre…")
        a = wait_for_worker(client)
        print(f"  raw_events {a['ingested']:,} · feldolgozva {a['processed']:,} · "
              f"hibás {a['failed']:,} ({time.monotonic() - t0:.0f} s)")
    print("kész.")


if __name__ == "__main__":
    main()

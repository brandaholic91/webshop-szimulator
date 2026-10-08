# world — a szintetikus webshop

A portfólió nyolc műszerének közös világa. Vásárló-szinten generál, és az igazság
ellentényes újrafuttatásból jön (`DECISIONS.md` 9., 24-27.).

## Futtatás

    uv sync
    uv run pytest                       # a világ tesztjei
    uv run python -m world.truth        # a világ + a 3 ellentényes futás -> out/
    uv run python -m world.noise        # 40 újrafuttatás -> out/world_noise.json (a ± az igazság mellé)
    uv run python -m world.publish      # out/ -> ../public/data/
    uv run python -m world.load         # emit -> HTTP -> a lokális világ-instance
    uv run python -m world.export       # SQL -> out/events_*.json
    uv run python -m world.attribution  # DB -> négy modell -> out/attribution.json

## Amit tudni kell

- `SEED = 20260827`. Ugyanaz a seed -> ugyanaz a világ.
- A `rng.py` `LAYERS` tuple-jébe **csak a végére** szabad új réteget fűzni.
- A `truth.json` **nem** megy a `public/data/`-ba, és csak a `compare.py` olvassa.
- A `load`, az `export` és az `attribution` futó világ-instance-ot kér (`~/Playground/fp-collector`,
  `docker-compose.world.yml`), és **csak `localhost` / `127.0.0.1` címre megy**.
- Az `export` nem ír fájlt, ha a pipeline száma nem egyezik az emit által elküldöttel. Próbafutás
  után (`--days N`) az instance-ot üríteni kell: `docker compose -f docker-compose.world.yml down -v`.

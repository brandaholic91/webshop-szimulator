# Webshop-szimulátor

Egy fiktív webshop szintetikus világa, és a rá épülő mérési műszerek kódja. A világ
vásárló-szinten generál, ezért minden becslés mellé oda lehet tenni az igazságot: az
ellentényes újrafuttatásból jön, nem modellből.

Ez a repo a [holikbalazs.hu](https://holikbalazs.hu) `/muszerek` oldalának kódja, az oldal
többi része nélkül. **Export**: egy privát repóból másolja ki egy script, ezért a history rövid,
és a változások nem itt születnek.

## Mi van benne

| Mappa | Mit tart |
|---|---|
| `world/` | A világ Pythonban: az adatgeneráló folyamat, az ellentényes futások, az esemény-export és az attribúciós modellek. Saját `pyproject.toml`, saját tesztek |
| `world/out/` | A világ futásának aggregált kimenete (JSON). Nyers eseményfolyam nincs a repóban |
| `demos/` | A műszerek TypeScriptben: a számolás (`.ts`) és a megjelenítés (`.tsx`), műszerenként egy mappa |
| `public/data/` | Az a JSON-készlet, amit a böngésző betölt. A `world/out/` egy része, a `world.publish` másolja ide |
| `public/events/` | Az események műszer saját trackere és a keret, amiben fut |
| `components/` | Az a négy közös komponens, amit a műszerek importálnak |

## Futtatás

### A világ

Python 3.13 és [uv](https://docs.astral.sh/uv/) kell hozzá.

    cd world
    uv sync
    uv run pytest                           # a világ tesztjei (pár perc)
    uv run python -m world.report           # kalibrációs riport
    uv run python -m world.truth            # a világ + 3 ellentényes futás -> out/
    uv run python -m world.noise            # 40 újrafuttatás -> out/world_noise.json
    uv run python -m world.export --emitted # csak az events_emitted.json; adatbázis nem kell
    uv run python -m world.publish          # out/ -> ../public/data/

A seed rögzített (`world/src/world/config.py`): ugyanaz a seed ugyanazt a világot adja.

Három parancs futó eseménygyűjtőt kér, mert a világ eseményeit egy valódi pipeline-on
küldi át, és onnan olvassa vissza:

    uv run python -m world.load         # emit -> HTTP -> a lokális gyűjtő
    uv run python -m world.export       # SQL -> out/events_*.json
    uv run python -m world.attribution  # DB -> négy modell -> out/attribution.json

A gyűjtő az [fp-collector](https://github.com/brandaholic91/fp-collector), a
`docker-compose.world.yml` fájljával indítva. Mindhárom parancs csak `localhost` /
`127.0.0.1` címre megy.

### A műszerek számolása

    npm install
    npm test        # vitest: demos/**/*.test.ts

A tesztek a számolást fedik (`.ts`). A `.tsx` fájlok önmagukban nem indíthatók el: az oldal
váza (útvonalak, stílusok, a többi lap) nincs ebben a repóban.

## Amit olvasás előtt érdemes tudni

- A kommentek magyarul vannak.
- A kommentekben szereplő „N. döntés", a `PLAN.md`, a `DECISIONS.md`, a `DESIGN.md` és a „spec"
  a privát repo tervezési naplójára utal, ami nincs itt.
- A `world/out/truth.json`-t a kódban egyetlen modul olvassa, a `world/src/world/compare.py`.
  A modellek nem látják; egy teszt (`world/tests/test_publish.py`) az egész repót átfésüli,
  hogy máshol ne bukkanjon fel.

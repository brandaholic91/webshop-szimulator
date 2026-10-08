"""Sessionök a pipeline-ból, és belőlük útvonalak az attribúciós modelleknek.

Ez a modell-oldal bemenete: csak azt látja, ami a pipeline adatbázisában van.
A generátor paramétereit és a világ igazság-fájlját nem olvassa (10. döntés,
1. szabály); a tests/test_attribution_models.py őrzi, hogy ez a fájl ne is
hivatkozzon az igazságot olvasó modulra.

Két lépés:
  fetch_sessions(conn)                 egy lekérdezés, sessionönként egy sor
  build_paths(sessions, window_days)   tiszta függvény, nincs benne I/O

A session-szintű adat (kb. 900 ezer sor) nem áll meg fájlban (3. szabály).
"""
from datetime import datetime, timedelta
from itertools import groupby
from typing import Iterable, NamedTuple

from psycopg.rows import tuple_row

from .emit import SOURCE_MEDIUM


class Session(NamedTuple):
    person_id: str             # a resolved_events nézetből, stitching után
    started_at: datetime       # a session első eseményének ideje
    channel: str               # csatorna-slug, a session ELSŐ eseményének forrásából
    value_huf: int | None      # a sessionhöz tartozó rendelés értéke, vagy None


class Path(NamedTuple):
    channels: tuple[str, ...]  # a sessionök csatornái időrendben; ismétlés megmarad
    days: tuple[float, ...]    # mindegyik távolsága napokban a záró sessiontől
    value_huf: int | None      # a rendelés értéke; None = nem konvertáló útvonal


# A session forrása és kezdete az ELSŐ eseményéé (a többin nincs forrásjel).
# A rendelés a session_id-n át kapcsolódik: a forrása így a session forrása.
# Az orders tábla saját forrás-oszlopait semmi nem olvassa, mert azok a
# purchase esemény forrásjelét hordozzák, ami mindig 'direct / none'.
SESSIONS_SQL = """
    WITH elso AS (
        SELECT DISTINCT ON (session_id)
               session_id, person_id, occurred_at AS started_at, source_medium
        FROM resolved_events
        ORDER BY session_id, occurred_at, id
    )
    SELECT e.person_id, e.started_at, e.source_medium, o.value AS value_huf
    FROM elso e LEFT JOIN orders o USING (session_id)
    ORDER BY e.person_id, e.started_at, e.session_id
"""


def to_sessions(rows: Iterable[tuple]) -> list[Session]:
    """(person_id, started_at, source_medium, value) sorokból Session-lista."""
    slug = {sm: s for s, sm in SOURCE_MEDIUM.items()}
    ki = []
    for person_id, started_at, source_medium, value in rows:
        if source_medium not in slug:
            raise ValueError(f"ismeretlen source_medium a pipeline-ban: {source_medium!r}")
        ki.append(Session(person_id, started_at, slug[source_medium],
                          None if value is None else int(value)))
    return ki


def fetch_sessions(conn) -> list[Session]:
    """Minden session, személy és azon belül idő szerint rendezve. Csak olvas."""
    return to_sessions(conn.cursor(row_factory=tuple_row).execute(SESSIONS_SQL))


def _path(tagok: list[Session], value_huf: int | None) -> Path:
    zaro = tagok[-1].started_at
    return Path(
        tuple(s.channel for s in tagok),
        tuple((zaro - s.started_at).total_seconds() / 86_400 for s in tagok),
        value_huf,
    )


def _non_converting(maradek: list[Session], ablak: timedelta) -> list[Path]:
    """Vásárlásig nem jutó sessionök útvonalai: ablaknál hosszabb szünetnél új kezdődik."""
    ki: list[Path] = []
    tagok: list[Session] = []
    for s in maradek:
        if tagok and s.started_at - tagok[-1].started_at > ablak:
            ki.append(_path(tagok, None))
            tagok = []
        tagok.append(s)
    if tagok:
        ki.append(_path(tagok, None))
    return ki


def build_paths(sessions: Iterable[Session], window_days: int) -> list[Path]:
    """Útvonalak a `window_days` napos lookback-ablakkal.

    A bemenet személy, azon belül idő szerint rendezett (ahogy a fetch_sessions adja).
    Minden rendeléses sessionhöz pontosan egy konvertáló útvonal készül: a
    vásárló session, és a személy azon korábbi sessionjei, amelyek az előző
    vásárlása UTÁN jöttek és a vásárlás előtti ablakon belül kezdődtek (a
    határ beleszámít). Ami kimarad, az nem konvertáló útvonal lesz.
    """
    ablak = timedelta(days=window_days)
    ki: list[Path] = []
    for _, szemely in groupby(sessions, key=lambda s: s.person_id):
        varakozo: list[Session] = []       # az utolsó vásárlás óta látott sessionök
        for s in szemely:
            if s.value_huf is None:
                varakozo.append(s)
                continue
            hatar = s.started_at - ablak
            k = next((i for i, v in enumerate(varakozo) if v.started_at >= hatar),
                     len(varakozo))
            ki.extend(_non_converting(varakozo[:k], ablak))
            ki.append(_path(varakozo[k:] + [s], s.value_huf))
            varakozo = []
        ki.extend(_non_converting(varakozo, ablak))
    return ki

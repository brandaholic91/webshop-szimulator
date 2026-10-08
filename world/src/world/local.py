"""A 2. nem-tárgyalható szabály kódban: szintetikus forgalom csak helyi gépre megy.

A load.py és az export.py is ezen át kapja a célcímét. Bármi, ami nem a saját
gép, hibával áll meg — még azelőtt, hogy egyetlen kérés vagy lekérdezés elindulna.
"""
import os
from urllib.parse import urlsplit

LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def require_local(url: str) -> str:
    parts = urlsplit(url)
    host = parts.hostname
    if host not in LOCAL_HOSTS:
        raise ValueError(
            f"csak helyi világ-instance engedélyezett (localhost / 127.0.0.1), "
            f"ez nem az: {host!r}"
        )
    if parts.scheme in ("postgresql", "postgres"):
        # a libpq a query-stringből és a környezetből is olvas kapcsolati paramétert
        # (host, hostaddr, PGHOSTADDR), ami felülírja az URL hosztját
        if parts.query:
            raise ValueError(
                "csak helyi világ-instance engedélyezett: a DSN nem hordozhat "
                "query-paramétert (a libpq a host/hostaddr értékét onnan is olvassa)"
            )
        if os.environ.get("PGHOSTADDR"):
            raise ValueError(
                "csak helyi világ-instance engedélyezett: a PGHOSTADDR környezeti "
                "változó be van állítva, és a libpq az URL hosztja helyett oda csatlakozna"
            )
    return url

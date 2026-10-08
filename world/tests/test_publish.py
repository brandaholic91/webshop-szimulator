import json
import os
from pathlib import Path

import world.publish as publish_mod
from world.publish import PUBLIC_FILES, PUBLIC_DIR, publish

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_a_truth_json_soha_nem_megy_ki():
    """1. nem-tárgyalható szabály. Ha ez a fájl kikerül a public/-ba, a lap
    minden 'becslés vs. igazság' sora megkérdőjelezhető lesz."""
    assert "truth.json" not in PUBLIC_FILES
    assert not (PUBLIC_DIR / "truth.json").exists()


def test_truth_json_csak_szankcionalt_helyeken_szerepel():
    """A fenti teszt csak a PUBLIC_FILES listát látja — egy .tsx-beli fetch()-et
    nem venne észre. Ez a teljes repót átfésüli a 'truth.json' string után:
    ha bárhol máshol felbukkan, az a szivárgás előszele."""
    skip_top = {".git", "node_modules", "dist", ".superpowers"}
    # A négy .py: az egyetlen olvasó (compare.py) és az írók (truth.py, publish.py
    # dönti el, hogy NEM megy ki). A vite.config.ts a dev-szerver tiltólistája —
    # blokkol, nem fogyaszt. A Readout.tsx kommentben, az Instrument.tsx egy UI-
    # feliratban idézi a fájlnevet, egyik sem éri el hálózatilag.
    sanctioned = {
        REPO_ROOT / "world/src/world/truth.py",
        REPO_ROOT / "world/src/world/compare.py",
        REPO_ROOT / "world/src/world/publish.py",
        REPO_ROOT / "world/src/world/rng.py",  # csak a modul-docstringben, magyarazokent
        REPO_ROOT / "vite.config.ts",
        REPO_ROOT / "components/Readout.tsx",
        REPO_ROOT / "pages/Instrument.tsx",
    }
    talalatok = []
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        rel = Path(dirpath).relative_to(REPO_ROOT)
        parts = rel.parts
        # Rejtett könyvtárak (.venv, .git, .superpowers…) és a __pycache__ bármilyen
        # mélységben kimaradnak. A world/.venv egyedül 1649 harmadik féltől származó
        # fájlt hozna be: ott egy felbukkanó "truth.json" string hamis riasztás lenne,
        # nem szivárgás.
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "__pycache__"]
        if parts and parts[0] in skip_top:
            dirnames[:] = []
            continue
        if parts[:2] == ("world", "out"):
            dirnames[:] = []
            continue
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix == ".md":
                continue
            if parts[:1] == ("docs",):
                continue
            if p.parent == REPO_ROOT / "world" / "tests":
                continue
            try:
                text = p.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if "truth.json" in text and p not in sanctioned:
                talalatok.append(str(p.relative_to(REPO_ROOT)))
    assert not talalatok, f"truth.json nem szankcionált helyen szerepel: {talalatok}"


def test_minden_szallitott_fajl_atkerult(tmp_path, monkeypatch):
    monkeypatch.setattr(publish_mod, "PUBLIC_DIR", tmp_path)
    utak = publish()
    assert len(utak) == len(PUBLIC_FILES)
    for u in utak:
        assert u.exists()
        json.loads(u.read_text(encoding="utf-8"))


def test_a_masolat_azonos_a_forrassal():
    """A committolt public/data/ állapotát ellenőrzi a world/out/ ellenében.
    NEM hívja a publish()-t — az korábban tautológiát csinált a tesztből
    (előbb felülírta a public/data/-t, aztán önmagához hasonlította)."""
    from world.truth import OUT
    for nev in PUBLIC_FILES:
        assert (OUT / nev).read_bytes() == (PUBLIC_DIR / nev).read_bytes()


def test_a_szallitott_meret_kicsi(tmp_path, monkeypatch):
    """A böngésző kis JSON-okon interpolál (9. fejezet). Ha ez elszáll,
    valószínűleg nyers eseményfolyam került bele — az tilos (3. szabály)."""
    monkeypatch.setattr(publish_mod, "PUBLIC_DIR", tmp_path)
    publish()
    for nev in PUBLIC_FILES:
        assert (tmp_path / nev).stat().st_size < 400_000, nev

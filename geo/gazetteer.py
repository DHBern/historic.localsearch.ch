"""Swiss place names -> places: the register and name matching of the address-book project.

Copied from thodel/vernetzte-schweiz, scripts/places.py at commit a6db42d (MIT, Tobias Hodel), without the parts
that check runs of headings against other years. Kept close to the original (German comments included) so that
a later copy stays a small diff. The reference tables in ref/ come from the same repository (data/ref, CC0):
the official directory of localities of swisstopo with the municipality of today, and the municipalities of
1914 from the historicised register of the BFS.
"""

from __future__ import annotations

import csv
import difflib
import math
import re
import unicodedata
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

REF = Path(__file__).resolve().parent / "ref"


def open_csv(path: Path) -> list[dict]:
    with open(path, "rt", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


CANTON_HINTS = {
    "b": "BE", "be": "BE", "bern": "BE", "sol": "SO", "so": "SO", "vd": "VD", "vaud": "VD",
    "st g": "SG", "sg": "SG", "st gall": "SG", "z": "ZH", "zh": "ZH", "zch": "ZH", "zur": "ZH",
    "lu": "LU", "luz": "LU", "ag": "AG", "aarg": "AG", "tg": "TG", "thurg": "TG", "thg": "TG",
    "gr": "GR", "graub": "GR", "fr": "FR", "frib": "FR", "ne": "NE", "neuch": "NE", "vs": "VS",
    "val": "VS", "valais": "VS", "ti": "TI", "tess": "TI", "bl": "BL", "baselland": "BL",
    "zeh": "ZH", "zurich": "ZH", "luzern": "LU", "st gallen": "SG", "aargau": "AG",
    "solothurn": "SO", "freiburg": "FR", "thurgau": "TG", "wallis": "VS", "gl": "GL", "glarus": "GL", "sh": "SH", "schaffh": "SH", "zg": "ZG", "zug": "ZG",
    "sz": "SZ", "schwyz": "SZ", "ow": "OW", "nw": "NW", "ur": "UR", "app": "AR", "ap": "AR",
    "ar": "AR", "ai": "AI", "ge": "GE", "geneve": "GE",
}
OCR_FIXES = [
    (re.compile(r"^Ea\b"), "La"), (re.compile(r"^JX"), "N"), (re.compile(r"\b8t\."), "St."),
    (re.compile(r"\b8t\b"), "St"), (re.compile(r"\bSt-"), "St-"),
]
CONNECTORS = {"im", "am", "an", "bei", "b", "ob", "sur", "sous", "pres", "près", "i", "a", "in", "auf", "near",
              "dorf", "platz", "bad"}

def key(s: str) -> str:
    s = s.lower().replace("ß", "ss")
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = re.sub(r"\bsaint\b|\bsankt\b", "st", s)
    s = re.sub(r"\bsainte\b", "ste", s)
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def split_locality(raw: str) -> tuple[str, str, str]:
    """«Bibern, Sol. (Hessigkofen)» → ("Bibern", "SO", "Hessigkofen")."""
    s = raw.strip()
    for rx, rep in OCR_FIXES:
        s = rx.sub(rep, s)
    paren = ""
    m = re.search(r"\((.*)\)?\s*$", s)
    if m:
        paren = m.group(1).rstrip(")").strip()
        s = s[: m.start()].strip()
    name, hint = s, ""
    if "," in s:
        name, rest = s.split(",", 1)
        hint = CANTON_HINTS.get(key(rest), "")
    else:
        # «Winterberg ZH», «Biel B.», «Gossau St. Gallen»
        toks = name.split()
        for n in (2, 1):
            if len(toks) > n and key(" ".join(toks[-n:])) in CANTON_HINTS and len(" ".join(toks[-n:])) <= 10:
                name, hint = " ".join(toks[:-n]), CANTON_HINTS[key(" ".join(toks[-n:]))]
                break
    return name.strip(" .,;:"), hint, paren


class Gazetteer:
    def __init__(self) -> None:
        self.cands: dict[str, list[dict]] = defaultdict(list)
        self.alias: dict[str, str] = {}
        locs = open_csv(REF / "localities.csv")
        plz_count: Counter = Counter()      # Postleitzahlen je Ortsname: Grössenmass

        coords: dict[str, tuple[float, float, float]] = {}
        for r in locs:
            base = re.sub(r"\s+\d+$", "", r["name"])            # «Lausanne 25» → Lausanne
            base = re.sub(r"\s+[A-Z]{2}$", "", base)            # «Winterberg ZH» → Winterberg
            plz_count[(key(base), r["bfs_today"])] += 1
            share = float(r["share"] or 0)
            if r["bfs_today"] not in coords or share > coords[r["bfs_today"]][2]:
                if key(base) == key(r["municipality_today"]) or r["bfs_today"] not in coords:
                    coords[r["bfs_today"]] = (float(r["lat"]), float(r["lon"]), share)
            self.cands[key(base)].append({
                "kind": "ortschaft", "name": base, "canton": r["canton"], "bfs_today": r["bfs_today"],
                "hist_code": "", "municipality_1914": "", "lat": float(r["lat"]), "lon": float(r["lon"]),
                "plz": 1,
            })
        for m in open_csv(REF / "municipalities_1914.csv"):
            name = re.sub(r"\s*\([A-Z]{2}\)$", "", m["name"])     # «Biel (BE)» → Biel
            first = m["bfs_today"].split(";")[0]
            lat, lon, _ = coords.get(first, (math.nan, math.nan, 0))
            self.cands[key(name)].append({
                "kind": "gemeinde_1914", "name": m["name"], "canton": m["canton"], "bfs_today": m["bfs_today"],
                "hist_code": m["hist_code"], "municipality_1914": m["name"], "lat": lat, "lon": lon,
                "plz": 1,
            })
        # Ortschaften gleichen Namens im selben Kanton wie eine Gemeinde 1914 gehen in dieser
        # auf (die Postleitzahl «Zürich 8041» liegt heute in Adliswil, gemeint ist Zürich);
        # die Gemeinde übernimmt die Koordinaten der Ortschaft in ihrer heutigen Gemeinde.
        for k, cs in self.cands.items():
            gem = [c for c in cs if c["kind"] == "gemeinde_1914"]
            for c in cs:
                c["plz"] = max(plz_count.get((k, b), 1) for b in c["bfs_today"].split(";"))
                if c["kind"] != "ortschaft":
                    continue
                for g in gem:
                    if g["canton"] == c["canton"]:
                        if c["bfs_today"] in g["bfs_today"].split(";") or math.isnan(g["lat"]):
                            g["lat"], g["lon"] = c["lat"], c["lon"]
                        c["merged"] = True
            self.cands[k] = [c for c in cs if not c.get("merged")]
        # Ortschaft → Gemeinde 1914: eindeutig, wenn ihre heutige Gemeinde aus genau einer Gemeinde von 1914
        # hervorgeht (Tenero → Tenero-Contra); sonst nur über data/ref/place_aliases.csv (Cassarate → Castagnola).
        # Die eindeutige Regel greift erst am Ende von resolve_all (`parent`, `municipality_of_locality`):
        # Lauf-, Jahres- und Namensabgleich sind an Ortschaften ohne Gemeinde geeicht. Trüge «Eidberg (Seen)»
        # schon vorher die Gemeinde Seen, bliebe die verlesene Überschrift über den Seiten von Einsiedeln stehen.
        by_today: dict[str, list[dict]] = defaultdict(list)
        by_name: dict[tuple[str, str], dict] = {}
        for cs in self.cands.values():
            for c in cs:
                if c["kind"] == "gemeinde_1914":
                    by_name[(c["name"], c["canton"])] = c
                    for b in c["bfs_today"].split(";"):
                        by_today[b].append(c)
        self.parent = {b: gs[0] for b, gs in by_today.items() if len(gs) == 1}
        for a in open_csv(REF / "place_aliases.csv"):
            g = by_name[(a["municipality_1914"], a["canton"])]
            same = [c for c in self.cands[key(a["name"])] if c["canton"] == a["canton"]]
            for c in same:
                c["hist_code"], c["municipality_1914"] = g["hist_code"], g["municipality_1914"]
            if not same:
                self.cands[key(a["name"])].append({**g, "kind": "ortschaft", "name": a["name"]})
        # «La Chaux-de-Fonds» auch ohne Artikel auffindbar
        for k in list(self.cands):
            m = re.match(r"^(la|le|les|l) (.+)$", k)
            if m and m.group(2) not in self.cands:
                self.alias[m.group(2)] = k
        self.by_first: dict[str, list[str]] = defaultdict(list)
        for k in self.cands:
            self.by_first[k[:1]].append(k)
        self._cc: dict[str, tuple[list[dict], str]] = {}

    @lru_cache(maxsize=None)
    def lookup(self, name: str) -> tuple[tuple, str]:
        k = key(name)
        if not k:
            return (), ""
        if k in self.cands:
            return tuple(map(id, self.cands[k])), "name"
        if k in self.alias:
            return tuple(map(id, self.cands[self.alias[k]])), "name"
        # «Langnau» → «Langnau im Emmental», «Matten» → «Matten bei Interlaken»
        longer = [ck for ck in self.by_first.get(k[:1], ())
                  if ck.startswith(k + " ") and ck[len(k) + 1:].split()[0] in CONNECTORS]
        if longer:
            return tuple(id(c) for h in longer for c in self.cands[h]), "namensanfang"
        toks = k.split()
        raw_toks = key(name.replace(".", ". ")).split()
        hits = []
        if len(toks) > 1 or "." in name:
            for ck in self.by_first.get(k[:1], ()):
                ct = ck.split()
                if len(ct) == len(raw_toks) and all(c == t or c.startswith(t) for c, t in zip(ct, raw_toks)):
                    hits.append(ck)
        if not hits:
            close = difflib.get_close_matches(k, self.by_first.get(k[:1], ()), n=3, cutoff=0.86)
            if close:
                hits = close[:1]
                return tuple(id(c) for h in hits for c in self.cands[h]), "unscharf"
            return (), ""
        return tuple(id(c) for h in hits for c in self.cands[h]), "abkürzung"

    def candidates(self, name: str) -> tuple[list[dict], str]:
        if name not in self._cc:
            self._cc[name] = self._candidates(name)
        return self._cc[name]

    def _candidates(self, name: str) -> tuple[list[dict], str]:
        ids, how = self.lookup(name)
        if not ids:
            return [], ""
        idset = set(ids)
        k = key(name)
        pool = self.cands.get(k) or [c for cs in self.cands.values() for c in cs if id(c) in idset]
        return [c for c in pool if id(c) in idset], how


def dist_km(a: dict, b: tuple[float, float]) -> float:
    if math.isnan(a["lat"]) or math.isnan(b[0]):
        return math.inf
    dy = (a["lat"] - b[0]) * 111.2
    dx = (a["lon"] - b[1]) * 111.2 * math.cos(math.radians(b[0]))
    return math.hypot(dx, dy)

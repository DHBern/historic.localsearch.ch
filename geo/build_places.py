"""Place table for the map (epic #42, issue #43): geo/build.sh runs this.

  build_places.py COUNTS.tsv OUT_DIR [COUNTS_NET.tsv]
      COUNTS: locality, file, year, entries (one row per locality and volume)
      COUNTS_NET: locality, file, network, entries (one row per locality, volume and network; #71)

Geocodes the locality STRINGS, not the entries. Every locality string of a volume gets the municipality of today
it lies in (one circle per municipality of today, decision of 20.11.2026) and a point. Names are resolved with
the place register in gazetteer.py and ref/. The key includes the volume because a name can mean different places
in different books: "Kilchberg" is in Baselland in volume 2 and in Zürich in volume 3; such names are decided by
the cantons the volume otherwise covers. A place found by its name alone must lie in the area of its volume: in
a canton that holds REGION of the volume, or within EDGE_KM of the places of the volume (Kerzers in the Bern
volume, #73); otherwise the name may be the short form of a place of the volume ("Erlenbach" for Erlenbach im
Simmental: namensanfang+volume), and if not, the string is out of region. A string that cannot be resolved, or that fits several places with
nothing to decide between them, gets no row: no guessing.

How a place is found (column method), and how far to trust it (column confidence):
  name, +canton ("Buchs St. G."), +exchange ("Trimstein, Netz Worb": the place of that name nearest to the
  exchange, at most NEAR_KM away), abkürzung ("Langnau i. E.")                                        high
  exchange-only (hamlet unknown, shown at its exchange), bei-only ("Papiermühle b. Bern": hamlet unknown,
  shown at the town it lies near, #72), name+volume (homonym decided by the volume),
  namensanfang ("Cheseaux" -> Cheseaux-sur-Lausanne), weiler (a settlement below the postal localities,
  from ref/hamlets.csv, if it is the only one of its name: "Kronbühl", "Räterschen"; #27)            medium
  unscharf (similar spelling, for misreadings; with an exchange at most FUZZY_KM away),
  unscharf+bei-only (the town of a "bei" form found by a similar spelling)                            low

A string that is not found as it stands is read another way before it is given up (#27): a reference ("Brand
siehe Lenk i." is shown at Lenk), a name turned round ("Stammheim, Ober-", "Tour-de-Peilz, La"), a region
instead of a canton ("Moutier Jura Bernois"), two languages ("Scuol / Schuls"), an abbreviation that broke off
("Langnau i."). Liechtenstein and Campione are out of region.

A name that stays ambiguous for a volume ("Reinach" in a volume with both) is decided per entry where the entry
itself says more: its field network names the canton ("Aarg.", "Bld.": name+canton, high), an area code ("064":
the candidate nearest to where the undoubted entries of that code lie, name+code, medium) or the exchange
("Egnach": name+exchange, high). These go to OUT_DIR/places_net_load.tsv for the table `places_net`, whose key
is locality, volume and network (#71).

Writes OUT_DIR/places.tsv (all keys, with the unplaced ones and why), OUT_DIR/places_load.tsv (the placed keys
in the column order of the table `places`, for db/places.sql) and OUT_DIR/report.json.
"""
import collections, csv, json, math, os, re, sys, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gazetteer as _places                                     # noqa: E402
from gazetteer import Gazetteer, split_locality, key, dist_km, REF   # noqa: E402
_places.CANTON_HINTS.update({"f": "FR", "n": "NE", "v": "VD", "g": "GE", "frbg": "FR", "nch": "NE", "t": "TI", "tic": "TI",
                             "ticino": "TI", "s": "SO", "a": "AG", "l": "LU", "th": "TG", "gris": "GR", "jb": "BE"})

NET = re.compile(r"^(.*?)[,;]?\s+(?:Netz|Netzgruppe|réseau|reseau|rete|groupe|Gruppe|gruppo)\s+(.+)$", re.I)
FUZZY_KM = 15     # ... and this near if the name only resembles the place
REGION = 0.005    # a place found by name alone must lie in a canton that holds this share of its volume
EDGE_KM = 10      # a place of a canton the volume hardly covers is kept if it lies this near to the places of the volume
NEAR_KM = 40      # a place must lie this near to its exchange
SAME_KM = 8       # candidates of one name this near to each other are one place (a postcode area over two municipalities)
ALIAS = {"bienne": "Biel|BE", "biel bienne": "Biel|BE", "geneve": "Genève", "genf": "Genève", "neuenburg": "Neuchâtel",
         "freiburg": "Fribourg", "sitten": "Sion", "siders": "Sierre", "pruntrut": "Porrentruy", "delsberg": "Delémont",
         "st gallen": "St. Gallen", "montana vermala": "Montana", "hasle ruegsau": "Hasle b. Burgdorf",
         "neukirch i": "Neukirch (Egnach)", "neukirch i e": "Neukirch (Egnach)"}   # "im Egnach": its hamlets say so (#27)
EXPAND = [(r"\ba\.\s?A\.?$", "an der Aare"), (r"\ba\.\s?Rh\.?$", "am Rhein"), (r"\bi\.\s?E\.?$", "im Emmental"),
          (r"\ba\.\s?S\.?$", "am See"), (r"\ba\.\s?A(?:lbis)?\.?$", "am Albis"), (r"\ba\.\s?I\.?$", "am Irchel"),
          (r"\bb\.\s", "bei "), (r"\bi\.\s?S\.?$", "im Simmental"), (r"\ba\.\s?d\.\s?", "an der ")]
MAIN_SHARE, EDGE_SHARE = 50, 10   # share of a postcode area in a municipality (per cent): its seat, and a mere edge
BEI = re.compile(r"^(.+?)(?:,?\s+(?:b\.|bei)|(?<!,)\s+B\.)\s+(.+)$")   # "Lengnau B. Biel" too, but not "Rothenfluh, B. L."
JOINED = re.compile(r"\s(?:[bai]\.|bei|am|im)\s")
SHORT = {"w thur": "Winterthur", "h buchsee": "Herzogenbuchsee", "n glatt": "Niederglatt", "f kappelen": "Frauenkappelen",
         "f kappel": "Frauenkappelen", "m buchsee": "Münchenbuchsee"}   # "Rickenbach b. W'thur"
BIG = {"altdorf": "UR"}   # the register has no sizes: the capital of Uri, not the village of 200 in Schaffhausen
CODE = re.compile(r"\b0\d\d\b")
CODE_MIN = 30     # undoubted entries of an area code needed to say where it lies
NET_CANTON = {**{k: v for k, v in _places.CANTON_HINTS.items() if len(k) > 2 or k in ("be", "so", "vd", "sg", "zh", "lu", "ag", "tg", "fr", "ne", "vs", "ti", "bl", "gl", "sh", "zg", "sz", "ow", "nw", "ur", "ar", "ai", "ge")},
              "fbg": "FR", "gve": "GE", "grb": "GR", "obw": "OW", "nidw": "NW", "st g": "SG"}
# #27: other ways to read a string the register does not know as it stands
SEE = re.compile(r"^(.+?)[,;]?\s+\(?(?:siehe(?: unter)?|s\.|voir(?: sous)?|vedi(?: sotto)?)\s+(.+?)\)?$", re.I)
TURNED = re.compile(r"^(.+?),?\s+(Ober|Unter|Nieder|Mittel|Hinter|Vorder|Gross|Klein)-$|^(.+?),\s*(La|Le|Les|L[’']|Il|Lo)$", re.I)
AREA = [(r"\s+(?:Jura Bernois|Berner Jura|J\. ?B\.)$", "Bern"), (r"\s+St\.? ?Gal[il]en$|\s+St\.?G\.?$|\s+(?:Rheintal|Toggenburg)$", "St. G."),
        (r"\s+Z[üu]richsee$", "Zch."), (r"\s+Obwalden$", "OW"), (r"\s+Nidwalden$", "NW"), (r"\s+Mesolcina$", "Graub."),
        (r"\s+Ne[nu][ec]h\.?$", "Neuch."), (r"\s+Eng(?:adin)?\.?$", "Graub."), (r"\s+Wall?is$|\s+Wai\.$", "Wallis")]
ABROAD = re.compile(r"F[üu]rstent(?:um|\.)?\s+Liechtenstein|\bd['’]Italia$", re.I)
CUT = re.compile(r"\s+[iab]\.?$")       # "Neukirch i.", "Oetwil a.": the abbreviation broke off


def variants(s, full):
    """The string read another way, most specific first: (string, the method must name the exchange)."""
    out = []
    m = SEE.match(s)
    if m: out.append((f"{m.group(1)}, Netz {full(m.group(2))}", True))
    m = TURNED.match(s)
    if m: out.append((m.group(2) + m.group(1).lower() if m.group(1) else f"{m.group(4)} {m.group(3)}".replace("’ ", "’").replace("' ", "'"), False))
    for rx, hint in AREA:
        if re.search(rx, s, re.I): out.append((re.sub(rx, "", s, flags=re.I) + ", " + hint, False))
    if "/" in s: out += [(p.strip(), False) for p in s.split("/") if len(p.strip()) > 2]
    if CUT.search(s) and full(s) != s: out.append((full(s), False))
    return [v for v in out if v[0] and v[0] != s]


LEAD = 3.0        # among several places of one name: the largest wins if it is this many times larger


def confidence(how):
    if how.startswith("unscharf"): return "low"
    if how in ("exchange-only", "bei-only", "name+volume", "name+code") or how.startswith(("namensanfang", "weiler")): return "medium"
    return "high"


def net_parts(net):
    """The field network of an entry: (canton or "", area code or "", the words without the code)."""
    code = CODE.search(net)
    words = re.sub(r"\(?\b0\d\d\b\)?|[()]", " ", net).strip(" .,")
    toks = key(words.replace(".", ". ")).split()
    canton = next((NET_CANTON[" ".join(toks[:n])] for n in (2, 1) if len(toks) >= n and " ".join(toks[:n]) in NET_CANTON), "")
    return canton, code.group(0) if code else "", words


def median(pairs):
    """Weighted median of (value, weight)."""
    pairs = sorted(pairs); half = sum(w for _, w in pairs) / 2; acc = 0
    for v, w in pairs:
        acc += w
        if acc >= half: return v


def by_network(R, counts_net, final, first, out):
    """#71: the keys that stay ambiguous, decided per network of the entry. Returns a report."""
    placed = {(loc, f): cand for loc, f, y, c, cand, how in final if cand and confidence(how) == "high"}
    amb = {(loc, f): first[loc][2] for loc, f, y, c, cand, how in final if how == "ambiguous" and len(first[loc][2]) > 1}
    pts = collections.defaultdict(list); todo = []          # (volume or "", code) -> [(lat, lon, entries)]
    for l in open(counts_net, encoding="utf-8"):
        loc, f, net, c = l.rstrip("\n").split("\t"); c = int(c)
        canton, code, words = net_parts(net.replace("\\\\", "\\"))
        if (loc, f) in amb: todo.append((loc, f, net, c, canton, code, words))
        elif code and (loc, f) in placed:
            p = placed[(loc, f)]
            for k in ((f, code), ("", code)): pts[k].append((p["lat"], p["lon"], c))
    centre = {k: (median([(a, w) for a, b, w in v]), median([(b, w) for a, b, w in v]))
              for k, v in pts.items() if sum(w for a, b, w in v) >= CODE_MIN}
    rep = collections.Counter(); rows = []

    def nearest(alts, point, lim=NEAR_KM):
        d = sorted((dist_km(a, point), i) for i, a in enumerate(alts))
        if d[0][0] <= lim and (len(d) == 1 or (d[1][0] >= 2 * d[0][0] and d[1][0] - d[0][0] >= FUZZY_KM)): return alts[d[0][1]]

    for loc, f, net, c, canton, code, words in todo:
        alts = amb[(loc, f)]; cand = None; how = ""
        rep["entries"] += c
        if canton:
            cs = [a for a in alts if a["canton"] == canton]
            if cs: cand = R.pick(cs, "name", title(loc))[0]; how = "name+canton"
        if not cand and code:
            point = centre.get((f, code)) or centre.get(("", code))
            if point: cand = nearest(alts, point); how = "name+code"
        if not cand and words and not canton:
            ex = R.exchange(words)
            # the register does not have every hamlet: only a candidate close to the exchange ("Niederwil", Cham)
            if ex: cand = nearest(alts, (ex["lat"], ex["lon"]), FUZZY_KM); how = "name+exchange"
        if not cand: rep["open " + ("canton" if canton else "code" if code else "words" if words else "nothing")] += c; continue
        rep["placed"] += c; rep["method " + how] += c
        b = cand["bfs_today"].split(";")[0]; mn = R.mun.get(b)
        rows.append((loc, f, net, cand["name"].replace("\t", " "), b, mn[0], cand["canton"], f'{mn[2]:.5f}', f'{mn[3]:.5f}',
                     f'{cand["lat"]:.5f}', f'{cand["lon"]:.5f}', how, confidence(how), c))
    with open(f"{out}/places_net_load.tsv", "w", encoding="utf-8") as fh:        # COPY text format; key columns as exported
        for r in rows: fh.write("\t".join(str(v) for v in r[:-1]) + "\n")
    with open(f"{out}/places_net.tsv", "w", encoding="utf-8") as fh:
        for r in rows: fh.write("\t".join(str(v) for v in r) + "\n")
    return dict(rep)


def unaccent(s):
    return "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))


def title(s):
    return s if not s.isupper() else re.sub(r"[^\W\d_]+", lambda m: m.group(0).capitalize(), s)


class Resolver:
    def __init__(self):
        self.g = Gazetteer()
        mun = {}                       # bfs -> (name, canton, lat, lon): the point of the municipality of today
        for r in csv.DictReader(open(REF / "localities.csv", encoding="utf-8")):
            b = r["bfs_today"]; same = key(re.sub(r"\s+(\d+|[A-Z]{2})$", "", r["name"])) == key(re.sub(r"\s*\([A-Z]{2}\)$", "", r["municipality_today"]))
            sc = (same, float(r["share"] or 0))
            if b not in mun or sc > mun[b][4]:
                mun[b] = (r["municipality_today"], r["canton"], float(r["lat"]), float(r["lon"]), sc)
        self.mun = mun
        # #27: settlements below the postal localities (ref/hamlets.csv, swissNAMES3D). A second register that holds
        # them as well is asked only for strings the first one cannot place, so nothing placed before moves.
        self.gh = Gazetteer(); self.base = self.g
        bfs = {(key(re.sub(r"\s*\([A-Z]{2}\)$", "", v[0])), v[1]): b for b, v in mun.items()}
        path = REF / "hamlets.csv"
        for r in (csv.DictReader(open(path, encoding="utf-8")) if path.exists() else ()):
            b = bfs.get((key(re.sub(r"\s*\([A-Z]{2}\)$", "", r["municipality"])), r["canton"])); k = key(r["name"])
            if not b or k in self.base.cands: continue
            if k not in self.gh.cands: self.gh.by_first[k[:1]].append(k)
            self.gh.cands[k].append({"kind": "weiler", "name": r["name"], "canton": r["canton"], "bfs_today": b, "hist_code": "",
                                     "municipality_1914": "", "lat": float(r["lat"]), "lon": float(r["lon"]),
                                     "plz": 1, "share": 100.0})

    def pick(self, cs, how, name):
        """One candidate out of several of the same name, or None if they are different places."""
        self.alts = []; self.fuzzy = how.startswith("unscharf")
        if not cs: return None, "unknown"
        far = max(dist_km(a, (b["lat"], b["lon"])) for a in cs for b in cs)
        if far <= SAME_KM:
            k = key(name)
            own = [c for c in cs if key(re.sub(r"\s*\([A-Z]{2}\)$", "", self.mun.get(c["bfs_today"].split(";")[0], ("",))[0])) == k]
            order = lambda c: (c["kind"] != "gemeinde_1914", -c["plz"], -c.get("share", 0))
            # two municipalities of today carry the name: the one that had it in 1914 ("Erlinsbach" is the one in
            # Aargau; the villages across the border were Nieder- and Obererlinsbach)
            if len({c["bfs_today"].split(";")[0] for c in own}) > 1: own = sorted(own, key=order)
            return (own or sorted(cs, key=order))[0], how
        big = [c for c in cs if c["canton"] == BIG.get(key(name))]
        if big: return big[0], how + "+largest"
        by = {}
        for c in cs: by.setdefault(c["bfs_today"].split(";")[0], c)
        ranked = sorted(by.values(), key=lambda c: -c["plz"])
        if len(ranked) > 1 and ranked[0]["plz"] >= LEAD * ranked[1]["plz"] and ranked[0]["plz"] >= 3: return ranked[0], how + "+largest"
        self.alts = list(by.values())
        return None, "ambiguous"

    def cands(self, name, printed=True):
        name, _, canton = ALIAS.get(key(name), name).partition("|")     # "Biel|BE": the other name leaves no doubt
        cs, how = self.g.candidates(name)
        if canton: cs = [c for c in cs if c["canton"] == canton]
        if not cs:
            for rx, rep in EXPAND:
                n2 = re.sub(rx, rep, name)
                if n2 != name:
                    cs, how = self.g.candidates(n2)
                    if cs: how = "abkürzung"; break
        cs = [c for c in cs if not math.isnan(c["lat"])]
        # "Brugg" is not "Brügg": the spelling as printed wins where the register has both
        bare = lambda c: re.sub(r"\s*\([A-Z]{2}\)$", "", c["name"]).casefold()
        exact = [c for c in cs if bare(c) == name.casefold()]
        if printed and exact and len(exact) < len(cs) and all(unaccent(bare(c)) == unaccent(name.casefold()) for c in cs): cs = exact
        # the edge of a postcode area in the next municipality is no second place of the name ("Engelberg" in Uri)
        main = [c for c in cs if c["kind"] == "gemeinde_1914" or (c.get("share") or 0) >= MAIN_SHARE]
        cs = [c for c in cs if c in main or (c.get("share") or 0) >= EDGE_SHARE
              or not any(dist_km(c, (m["lat"], m["lon"])) <= 2 * SAME_KM for m in main)]
        return cs, how

    def town(self, name):
        cs, how = self.cands(name, printed=False)    # exchanges are named loosely: "Netz Brugg" is Brügg near Biel
        return self.pick(cs, how, name) if cs else (None, "")

    def wider(self, name):
        """The places of a name, with those that carry it as their first part: "Büren" is also Büren an der Aare."""
        cs, how = self.cands(name)
        k = key(name)
        more = [c for ck in self.g.by_first.get(k[:1], ()) if ck.startswith(k + " ") and ck[len(k) + 1:].split()[0] in _places.CONNECTORS
                for c in self.g.cands[ck] if not math.isnan(c["lat"])] if how == "name" else []
        # "Davos Dorf" is no second Davos
        return cs + [c for c in more if c not in cs and not any(dist_km(c, (o["lat"], o["lon"])) <= 2 * SAME_KM for o in cs)], how

    def exchange(self, exch):
        """The town an exchange is named after."""
        if not exch: return None
        if JOINED.search(exch) and "," not in exch:          # "Wohlen b. B.", "Erlenbach i. S.": its last letter is no canton
            ex = self.town(exch.strip(" ,;"))[0]
            if ex: return ex
        ex = self.town(split_locality(exch)[0])[0]
        if not ex and "," in exch:                           # "Fresens (St-Aubin, N.)": the canton tells the exchanges apart
            en, eh, _ = split_locality(exch)
            ecs, ehow = self.cands(en)
            ecs = [c for c in ecs if c["canton"] == eh] if eh else []
            if ecs: ex = self.pick(ecs, ehow, en)[0]
        return ex

    def resolve(self, raw):
        """resolve_one, and for a string it does not know the same string read another way (#27)."""
        cand, how = self.resolve_one(raw)
        if cand or how != "unknown": return cand, how
        s = raw.strip()
        if ABROAD.search(s): return None, "out-of-region"
        keep = (self.alts, self.fuzzy, self.whole)
        try:
            for g in (self.base, self.gh):
                self.g = g
                for v, by_exchange in ([(s, False)] if g is self.gh else []) + variants(s, self.full):
                    self.alts = []; self.fuzzy = False; self.whole = False
                    c2, h2 = self.resolve_one(v)
                    if by_exchange and "exchange" not in h2: continue      # "Bussy s. Ms" names no exchange
                    # no guessing among hamlets: many share a name, so no similar spelling and no choice by the volume
                    # (tried on 27.11.2026: "Kulm" went to Arosa, "Vorstadt" to Dietikon), and a hamlet is no exchange
                    # for a name that stays unknown ("Riedbach" is also in the Valais)
                    if g is self.gh and h2 == "ambiguous" and any(a["kind"] == "weiler" for a in self.alts): continue
                    if c2 and c2["kind"] == "weiler" and (h2.startswith("unscharf") or h2 == "exchange-only"): continue
                    if c2 and c2["kind"] == "weiler" and h2.startswith("name"): h2 = "weiler" + h2[len(h2.split("+")[0]):]
                    if c2 or h2 == "ambiguous": return c2, h2
        finally: self.g = self.base
        self.alts, self.fuzzy, self.whole = keep
        return cand, how

    def full(self, name):
        """"Erlenbach i." -> "Erlenbach im Simmental" if the register has one place that goes on like this."""
        m = CUT.search(name)
        if not m: return name
        k = key(name[:m.start()]); a = key(m.group(0))[:1]
        ks = [ck for ck in self.g.by_first.get(k[:1], ()) if ck.startswith(k + " ") and ck[len(k) + 1:].split()[0] in _places.CONNECTORS
              and ck[len(k) + 1:].startswith(a)]
        cs = [c for ck in ks for c in self.g.cands[ck] if not math.isnan(c["lat"])]
        if cs and max(dist_km(x, (y["lat"], y["lon"])) for x in cs for y in cs) <= SAME_KM: return cs[0]["name"]
        return name

    def resolve_one(self, raw):
        s = title(raw.strip())
        exch = ""
        m = NET.match(s)
        if m: s, exch = m.group(1), m.group(2)
        app = re.search(r",?\s*App(?:enzell)?\.?\s*([AI])\.?\s?-?\s?Rh\.?", s)      # "Haslen, App. I.-Rh. (Teufen)"
        if app: s = s[:app.start()] + s[app.end():]
        name, hint, paren = split_locality(s)
        if app: hint = "A" + app.group(1)
        # "Wald (Zch.)": an abbreviation is the canton, no exchange; "Littau (Luzern)" is the exchange in the town
        if not hint and paren.endswith(".") and key(paren) in _places.CANTON_HINTS and len(paren) <= 10:
            hint, paren = _places.CANTON_HINTS[key(paren)], ""
        exch = exch or paren
        exch = re.sub(r"\b0\d\d\b|\(|\)", "", exch).strip()
        full, fhow = self.cands(re.sub(r"\s*\(.*$", "", s).strip(" ,."))   # "Muri b. Bern" as a whole before taking it apart
        cs, how = self.cands(name)
        toks = name.split()
        if not cs and len(toks) > 1 and key(toks[-1]) == "appenzell":          # "Teufen Appenzell"
            cs, how = self.cands(" ".join(toks[:-1])); cs = [c for c in cs if c["canton"] in ("AR", "AI")]; how += "+canton"
        exch = re.sub(r"\b0\d\d\b|\(|\)", "", exch).strip()
        ex = self.exchange(exch)
        # "Lengnau b. Biel", "Lengnau, bei Biel", "Reichenbach b. Bern": taken apart before the comma or a town that
        # is also the name of a canton is read as something else
        base = re.sub(r"\s*\(.*$", "", s).strip(" ,.")
        self.whole = bool(full and BEI.match(base) and not fhow.startswith("unscharf"))
        bei = None if full or (cs and BEI.match(name)) else BEI.match(base)
        if bei:
            x, y = bei.group(1).strip(" ,"), bei.group(2).strip(" ,.")
            yhint = ""
            if "," in y: y, yhint, _ = split_locality(y)                    # "Oberwil b. Bremgarten, Aarg."
            y = SHORT.get(key(y), y)
        if bei and len(key(y)) < 3: bei = None                             # "Rothenfluh, b. l." is Baselland
        if bei:
            xcs, xhow = self.cands(x); ycs, yhow = self.wider(y)
            if yhint: xcs = [c for c in xcs if c["canton"] == yhint] or xcs; ycs = [c for c in ycs if c["canton"] == yhint] or ycs
            if xhow == "namensanfang":      # "Wilen bei Neunforn" is not the Wilen near Herdern
                first = lambda n: (key(n).split() or [""])[0]
                xcs = [c for c in xcs if not BEI.match(c["name"]) or first(BEI.match(c["name"]).group(2)) == first(y)]
            loose = ycs if yhint else ycs + [c for c in self.cands(y, printed=False)[0] if c not in ycs]
            pairs = sorted((dist_km(c, (e["lat"], e["lon"])), i) for i, c in enumerate(xcs) for e in loose)
            if pairs and pairs[0][0] <= FUZZY_KM and not xhow.startswith("unscharf"):     # the Lengnau near Biel
                near = xcs[pairs[0][1]]
                same = [c for c in xcs if dist_km(c, (near["lat"], near["lon"])) <= SAME_KM]
                return (self.pick(same, xhow, x)[0] or near), xhow + "+exchange"
            # X is a hamlet the register does not have, or only has elsewhere: the entry is shown at Y, which lies
            # nearer than the exchange. A Y of several places, or one found by a similar spelling, must lie near
            # the exchange if one is named; without one the volume decides between several.
            if ycs:
                fz = yhow.startswith("unscharf")
                one = max(dist_km(a, (b["lat"], b["lon"])) for a in ycs for b in ycs) <= SAME_KM
                if ex and (fz or not one):
                    ynear = sorted(ycs, key=lambda c: dist_km(c, (ex["lat"], ex["lon"])))
                    ok = dist_km(ynear[0], (ex["lat"], ex["lon"])) <= (FUZZY_KM if fz else NEAR_KM)
                    ycs = [c for c in ycs if dist_km(c, (ynear[0]["lat"], ynear[0]["lon"])) <= SAME_KM] if ok else []
                if ycs:
                    cand, h = self.pick(ycs, yhow, y)
                    if cand: return cand, ("unscharf+" if fz else "") + "bei-only"
                    if not exch: return cand, h                            # several places: decided by the volume
            if not exch: return None, "unknown"     # "bei" names no exchange, and the whole is no name of its own
        if not cs and "," in s and not exch:                                   # "Riedbach, Bern": hamlet, town
            exch = s.split(",", 1)[1].strip()
        # the whole as a name of its own ("Muri b. Bern"), but a canton is not given up for a longer name that the
        # whole merely abbreviates: "Biel Be" is Biel in Bern, not Biel-Benken; "Brienz, B." is not Brinzauls
        hinted = hint and any(c["canton"] == hint for c in cs) and not JOINED.search(s + " ")   # not "Beinwil a. S."
        if full and (not cs or key(name) != key(s)) and not (hinted and fhow == "abkürzung") and self.pick(full, fhow, s)[0]: cs, how, hint = full, fhow, ""
        exch = re.sub(r"\b0\d\d\b|\(|\)", "", exch).strip()
        ex = self.exchange(exch)
        if not cs:
            if ex: return ex, "exchange-only"        # hamlet unknown: the entry is shown at its exchange
            return None, "unknown"
        if hint:
            h = [c for c in cs if c["canton"] == hint]
            if h: cs, how = h, how + "+canton"
        if ex:
            near = sorted(cs, key=lambda c: dist_km(c, (ex["lat"], ex["lon"])))
            lim = NEAR_KM if how.startswith("name") and not how.startswith("namens") else FUZZY_KM
            if dist_km(near[0], (ex["lat"], ex["lon"])) <= lim:
                # the rows of one postcode area over several municipalities are one place: not the nearest sliver
                same = [c for c in cs if dist_km(c, (near[0]["lat"], near[0]["lon"])) <= SAME_KM]
                return (self.pick(same, how, name)[0] or near[0]), how + "+exchange"
            return ex, "exchange-only"
        return self.pick(cs, how, name)


def main():
    counts, out = sys.argv[1:3]; os.makedirs(out, exist_ok=True)
    n = collections.Counter(); dec = collections.defaultdict(collections.Counter)
    perfile = collections.defaultdict(dict)
    for l in open(counts, encoding="utf-8"):
        loc, f, y, c = l.rstrip("\n").split("\t"); n[loc] += int(c); dec[loc][int(y) // 10 * 10] += int(c)
        perfile[loc][f] = (int(y), int(c))
    R = Resolver(); rep = collections.Counter(); bydec = collections.defaultdict(collections.Counter); rows = []
    # pass 1: every string on its own
    first = {}; fuzzy = {}; whole = {}; anchors = {}
    weight = collections.defaultdict(collections.Counter)      # volume -> canton -> entries of the places found
    for loc in n:
        R.alts = []; R.fuzzy = False; R.whole = False
        cand, how = R.resolve(loc)
        first[loc] = (cand, how, R.alts if how == "ambiguous" else [])
        whole[loc] = R.whole      # "Ried b. Kerzers" names its region itself
        fuzzy[loc] = R.fuzzy      # a similar spelling that fits several places is not decided by the volume ("Rüthi")
        if cand:
            for f, (y, c) in perfile[loc].items(): weight[f][cand["canton"]] += c
    # pass 2: a name that fits several places is decided per volume, by the region the volume covers
    final = []                                                   # (loc, file, year, entries, cand, how)
    for loc, c in n.most_common():
        cand, how, alts = first[loc]
        for f, (y, k) in perfile[loc].items():
            c2, h2 = cand, how
            if len(alts) > 1:
                tot = sum(weight[f].values()) or 1
                r = sorted(alts, key=lambda a: -weight[f][a["canton"]])
                w0, w1 = weight[f][r[0]["canton"]], weight[f][r[1]["canton"]]
                # a hamlet does not win over a municipality of the name that the volume covers as well ("Teufen")
                weak = r[0]["kind"] != "gemeinde_1914" and any(a["kind"] == "gemeinde_1914" and weight[f][a["canton"]] >= REGION * tot for a in r[1:])
                if r[0]["canton"] != r[1]["canton"] and w0 >= 3 * max(w1, 1) and w0 >= 0.01 * tot and not weak and not fuzzy.get(loc): c2, h2 = r[0], "name+volume"
            elif cand and "exchange" not in how and "canton" not in how and "bei-only" not in how and not whole[loc]:
                tot = sum(weight[f].values()) or 1
                if weight[f][cand["canton"]] < REGION * tot:
                    # #73: the cantons alone are too coarse. A place on the edge of the area is a place of the volume
                    # (Kerzers in the Bern volume, Appenzell in the volume of eastern Switzerland) ...
                    if f not in anchors:
                        anchors[f] = [(a["lat"], a["lon"]) for l2, (a, h, _) in first.items()
                                      if a and f in perfile[l2] and perfile[l2][f][1] >= 3 and confidence(h) == "high"
                                      and weight[f][a["canton"]] >= REGION * tot]
                    # (not for a similar spelling: near the edge there is always some place that resembles it)
                    if not how.startswith("unscharf") and min((dist_km(cand, p) for p in anchors[f]), default=math.inf) <= EDGE_KM: rep["edge entries"] += k
                    else:
                        # ... and a name that only fits elsewhere may be the short form of a place of the volume:
                        # "Erlenbach" in the Bern volume is Erlenbach im Simmental, not the one on the lake of Zürich
                        c2, h2 = None, "out-of-region"
                        if how == "name":
                            more = [a for a in R.wider(title(loc))[0] if a is not cand and weight[f][a["canton"]] >= REGION * tot]
                            one = R.pick(more, "namensanfang", title(loc))[0] if more else None
                            if one: c2, h2 = one, "namensanfang+volume"
            final.append((loc, f, y, k, c2, h2))
    rows = []
    for loc, f, y, c, cand, how in final:
        rep["keys"] += 1; rep["entries"] += c
        cls = "placed" if cand else how
        rep[cls + " keys"] += 1; rep[cls + " entries"] += c
        if cand: rep["method " + how] += c
        bydec[y // 10 * 10]["entries"] += c; bydec[y // 10 * 10][cls] += c
        b = cand["bfs_today"].split(";")[0] if cand else ""; mn = R.mun.get(b)
        rows.append((loc, f, cand["name"] if cand else "", b, mn[0] if mn else "", cand["canton"] if cand else "",
                     f'{cand["lat"]:.5f}' if cand else "", f'{cand["lon"]:.5f}' if cand else "",
                     f'{mn[2]:.5f}' if mn else "", f'{mn[3]:.5f}' if mn else "", how, confidence(how) if cand else "", c))
    with open(f"{out}/places.tsv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n", quoting=csv.QUOTE_NONE, escapechar="\\")
        w.writerow("locality file name bfs municipality canton lat lon mun_lat mun_lon method confidence entries".split())
        w.writerows(rows)
    with open(f"{out}/places_load.tsv", "w", encoding="utf-8") as f:   # COPY text format
        esc = lambda v: str(v).replace("\\", "\\\\").replace("\t", " ")
        for r in rows:
            if r[3]: f.write("\t".join(esc(r[i]) for i in (0, 1, 2, 3, 4, 5, 8, 9, 6, 7, 10, 11)) + "\n")
    net = by_network(R, sys.argv[3], final, first, out) if len(sys.argv) > 3 else None
    rep = dict(rep); rep["by_network"] = net; rep["by_decade"] = {d: dict(v) for d, v in sorted(bydec.items())}
    json.dump(rep, open(f"{out}/report.json", "w"), indent=1, ensure_ascii=False)
    E = rep["entries"]
    print(f'strings {len(n)}, keys (string and volume) {rep["keys"]}, entries {E}')
    for k in ("placed", "ambiguous", "unknown", "out-of-region"):
        print(f'  {k:10s} {rep.get(k+" keys",0):6d} keys  {rep.get(k+" entries",0):8d} entries  {100*rep.get(k+" entries",0)/E:5.1f} %')
    for k in sorted(rep):
        if k.startswith("method "): print(f'  {k:40s} {rep[k]:8d} {100*rep[k]/E:5.1f} %')
    for d, v in rep["by_decade"].items(): print(d, v["entries"], f'{100*v.get("placed",0)/v["entries"]:.1f} % placed')
    for cls in ("unknown", "ambiguous"):
        t = collections.Counter()
        for r in rows:
            if r[-3] == cls: t[r[0]] += r[-1]
        print("top", cls, t.most_common(40))
    if net: print("by network (#71):", net)


if __name__ == "__main__":
    main()

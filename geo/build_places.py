"""Place table for the map (epic #42, issue #43): geo/build.sh runs this.

  build_places.py COUNTS.tsv OUT_DIR        COUNTS: locality, file, year, entries (one row per locality and volume)

Geocodes the locality STRINGS, not the entries. Every locality string of a volume gets the municipality of today
it lies in (one circle per municipality of today, decision of 20.11.2026) and a point. Names are resolved with
the place register in gazetteer.py and ref/. The key includes the volume because a name can mean different places
in different books: "Kilchberg" is in Baselland in volume 2 and in Zürich in volume 3; such names are decided by
the cantons the volume otherwise covers. A string that cannot be resolved, or that fits several places with
nothing to decide between them, gets no row: no guessing.

How a place is found (column method), and how far to trust it (column confidence):
  name, +canton ("Buchs St. G."), +exchange ("Trimstein, Netz Worb": the place of that name nearest to the
  exchange, at most NEAR_KM away), abkürzung ("Langnau i. E.")                                        high
  exchange-only (hamlet unknown, shown at its exchange), name+volume (homonym decided by the volume),
  namensanfang ("Cheseaux" -> Cheseaux-sur-Lausanne)                                                  medium
  unscharf (similar spelling, for misreadings; with an exchange at most FUZZY_KM away)                low

Writes OUT_DIR/places.tsv (all keys, with the unplaced ones and why), OUT_DIR/places_load.tsv (the placed keys
in the column order of the table `places`, for db/places.sql) and OUT_DIR/report.json.
"""
import collections, csv, json, math, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gazetteer as _places                                     # noqa: E402
from gazetteer import Gazetteer, split_locality, key, dist_km, REF   # noqa: E402
_places.CANTON_HINTS.update({"f": "FR", "n": "NE", "v": "VD", "g": "GE", "frbg": "FR", "nch": "NE", "t": "TI", "tic": "TI",
                             "ticino": "TI", "s": "SO", "a": "AG", "l": "LU", "th": "TG", "gris": "GR", "jb": "BE"})

NET = re.compile(r"^(.*?)[,;]?\s+(?:Netz|Netzgruppe|réseau|reseau|rete|groupe|Gruppe|gruppo)\s+(.+)$", re.I)
FUZZY_KM = 15     # ... and this near if the name only resembles the place
REGION = 0.005    # a place found by name alone must lie in a canton that holds this share of its volume
NEAR_KM = 40      # a place must lie this near to its exchange
SAME_KM = 8       # candidates of one name this near to each other are one place (a postcode area over two municipalities)
ALIAS = {"bienne": "Biel|BE", "biel bienne": "Biel|BE", "geneve": "Genève", "genf": "Genève", "neuenburg": "Neuchâtel",
         "freiburg": "Fribourg", "sitten": "Sion", "siders": "Sierre", "pruntrut": "Porrentruy", "delsberg": "Delémont",
         "st gallen": "St. Gallen", "montana vermala": "Montana", "hasle ruegsau": "Hasle b. Burgdorf"}
EXPAND = [(r"\ba\.\s?A\.?$", "an der Aare"), (r"\ba\.\s?Rh\.?$", "am Rhein"), (r"\bi\.\s?E\.?$", "im Emmental"),
          (r"\ba\.\s?S\.?$", "am See"), (r"\ba\.\s?A(?:lbis)?\.?$", "am Albis"), (r"\ba\.\s?I\.?$", "am Irchel"),
          (r"\bb\.\s", "bei "), (r"\bi\.\s?S\.?$", "im Simmental"), (r"\ba\.\s?d\.\s?", "an der ")]
LEAD = 3.0        # among several places of one name: the largest wins if it is this many times larger


def confidence(how):
    if how.startswith("unscharf"): return "low"
    if how in ("exchange-only", "name+volume") or how.startswith("namensanfang"): return "medium"
    return "high"


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

    def pick(self, cs, how, name):
        """One candidate out of several of the same name, or None if they are different places."""
        self.alts = []
        if not cs: return None, "unknown"
        far = max(dist_km(a, (b["lat"], b["lon"])) for a in cs for b in cs)
        if far <= SAME_KM:
            k = key(name)
            own = [c for c in cs if key(re.sub(r"\s*\([A-Z]{2}\)$", "", self.mun.get(c["bfs_today"].split(";")[0], ("",))[0])) == k]
            return (own or sorted(cs, key=lambda c: (c["kind"] != "gemeinde_1914", -c["plz"])))[0], how
        by = {}
        for c in cs: by.setdefault(c["bfs_today"].split(";")[0], c)
        ranked = sorted(by.values(), key=lambda c: -c["plz"])
        if len(ranked) > 1 and ranked[0]["plz"] >= LEAD * ranked[1]["plz"] and ranked[0]["plz"] >= 3: return ranked[0], how + "+largest"
        self.alts = list(by.values())
        return None, "ambiguous"

    def cands(self, name):
        name, _, canton = ALIAS.get(key(name), name).partition("|")     # "Biel|BE": the other name leaves no doubt
        cs, how = self.g.candidates(name)
        if canton: cs = [c for c in cs if c["canton"] == canton]
        if not cs:
            for rx, rep in EXPAND:
                n2 = re.sub(rx, rep, name)
                if n2 != name:
                    cs, how = self.g.candidates(n2)
                    if cs: how = "abkürzung"; break
        return [c for c in cs if not math.isnan(c["lat"])], how

    def town(self, name):
        cs, how = self.cands(name)
        return self.pick(cs, how, name) if cs else (None, "")

    def resolve(self, raw):
        s = title(raw.strip())
        exch = ""
        m = NET.match(s)
        if m: s, exch = m.group(1), m.group(2)
        app = re.search(r",?\s*App(?:enzell)?\.?\s*([AI])\.?\s?-?\s?Rh\.?", s)      # "Haslen, App. I.-Rh. (Teufen)"
        if app: s = s[:app.start()] + s[app.end():]
        name, hint, paren = split_locality(s)
        if app: hint = "A" + app.group(1)
        exch = exch or paren
        exch = re.sub(r"\b0\d\d\b|\(|\)", "", exch).strip()
        full, fhow = self.cands(re.sub(r"\s*\(.*$", "", s).strip(" ,."))   # "Muri b. Bern" as a whole before taking it apart
        cs, how = self.cands(name)
        toks = name.split()
        if not cs and len(toks) > 1 and key(toks[-1]) == "appenzell":          # "Teufen Appenzell"
            cs, how = self.cands(" ".join(toks[:-1])); cs = [c for c in cs if c["canton"] in ("AR", "AI")]; how += "+canton"
        if not cs and "," in s and not exch:                                   # "Riedbach, Bern": hamlet, town
            exch = s.split(",", 1)[1].strip()
        if full and (not cs or key(name) != key(s)) and self.pick(full, fhow, s)[0]: cs, how, hint = full, fhow, ""
        exch = re.sub(r"\b0\d\d\b|\(|\)", "", exch).strip()
        ex, _ = self.town(split_locality(exch)[0]) if exch else (None, "")
        if not cs:
            if ex: return ex, "exchange-only"        # hamlet unknown: the entry is shown at its exchange
            return None, "unknown"
        if hint:
            h = [c for c in cs if c["canton"] == hint]
            if h: cs, how = h, how + "+canton"
        if ex:
            near = sorted(cs, key=lambda c: dist_km(c, (ex["lat"], ex["lon"])))
            lim = NEAR_KM if how.startswith("name") and not how.startswith("namens") else FUZZY_KM
            if dist_km(near[0], (ex["lat"], ex["lon"])) <= lim: return near[0], how + "+exchange"
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
    first = {}
    weight = collections.defaultdict(collections.Counter)      # volume -> canton -> entries of the places found
    for loc in n:
        R.alts = []
        cand, how = R.resolve(loc)
        first[loc] = (cand, how, R.alts if how == "ambiguous" else [])
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
                if r[0]["canton"] != r[1]["canton"] and w0 >= 3 * max(w1, 1) and w0 >= 0.01 * tot: c2, h2 = r[0], "name+volume"
            elif cand and "exchange" not in how and "canton" not in how:
                tot = sum(weight[f].values()) or 1
                if weight[f][cand["canton"]] < REGION * tot: c2, h2 = None, "out-of-region"
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
    rep = dict(rep); rep["by_decade"] = {d: dict(v) for d, v in sorted(bydec.items())}
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


if __name__ == "__main__":
    main()

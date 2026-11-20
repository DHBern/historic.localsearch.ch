"""Street points for the map (#46): geo/build.sh runs this after the place table.

  build_streets.py STREETS.tsv OUT_DIR      STREETS: bfs, street, entries (street strings of the entries the place
                                            table puts in the municipalities of street_towns.txt)

Like the place table, this resolves the STRINGS, not the entries: "Forchstr. 381" -> Forchstrasse, with the point
the official directory of streets gives that street (ref/streets_official.csv). House numbers are not placed: the
point is one point of today's street of that name. A street that was renamed, a building given as address or a
misreading gets no row.

Writes OUT_DIR/streets_load.tsv (bfs, street as printed, name, lat, lon; COPY text format) and streets_report.json.
"""
import collections, csv, json, math, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
SAME_KM = 0.7   # two streets of one name in a municipality, this far apart: not decidable from the name

ABBR = [(r"str\.?$", "strasse"), (r"(?<=[a-zäöü])g\.$", "gasse"), (r"(?<=[a-zäöü])w\.$", "weg"),
        (r"(?<=[a-zäöü])pl\.$", "platz"), (r"(?<=[a-zäöü])q\.$", "quai"), (r"vorst\.$", "vorstadt"),
        (r"^Unt\. ", "Untere "), (r"^Ob\. ", "Obere "), (r"^St\.\s?(?=[A-Z])", "St. ")]


def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower().replace("ß", "ss")) if not unicodedata.combining(c))


def clean(street):
    """The street name in a street field: "Forchstr. 381" -> "Forchstrasse"; None if it names another place."""
    s = street.strip()
    if re.search(r",\s*[^\W\d_](?:[^\W\d_]|['’])", s): return None                    # "Zollstr. 24, W'thur"
    s = s.split("/")[0]
    s = re.sub(r"(?<=[a-zäöüé])-\s+(?=[a-zäöü])", "", s)               # "Weiher- weg"
    s = re.sub(r"-(?=str\b|strasse|gasse|weg|platz)", "", s)             # "Briner-str."
    s = re.sub(r"^\d+\s*(bis|ter|[a-c])?\s+", "", s)                     # "20 Bahnhofstr."
    dot = s.rstrip(" ,0123456789").endswith(".")
    s = re.sub(r"[,\s]+\d+[\dIlOo]*\s*(bis|ter|[a-z])?\.?$", "", s).strip(" ,.") + ("." if dot else "")
    s = re.sub(r"[,\s]+\d.*$", "", s).strip(" ,")
    for rx, rep in ABBR: s = re.sub(rx, rep, s)
    return s


def key(s):
    return "".join(re.sub(r"[^a-z0-9 ]+", " ", fold(s)).split()).replace("strasse", "str")


def km(a, b):
    return math.hypot((a[0] - b[0]) * 111.2, (a[1] - b[1]) * 76)


def register():
    """bfs -> key -> (name, lat, lon); names that stand for two distant streets are left out."""
    out = collections.defaultdict(dict); twice = collections.defaultdict(set)
    for r in csv.DictReader(open(os.path.join(HERE, "ref", "streets_official.csv"), encoding="utf-8")):
        k = key(r["name"]); p = (float(r["lat"]), float(r["lon"])); t = out[r["bfs"]]
        if k in t and km(t[k][1:], p) > SAME_KM: twice[r["bfs"]].add(k)
        t.setdefault(k, (r["name"],) + p)
    for b, ks in twice.items():
        for k in ks: out[b].pop(k, None)
    return out


def main():
    src, out = sys.argv[1:3]; os.makedirs(out, exist_ok=True)
    reg = register(); rep = collections.defaultdict(collections.Counter)
    esc = lambda v: str(v).replace("\\", "\\\\").replace("\t", " ")
    with open(f"{out}/streets_load.tsv", "w", encoding="utf-8") as f:
        for line in open(src, encoding="utf-8"):
            bfs, street, n = line.rstrip("\n").split("\t"); n = int(n)
            rep[bfs]["entries"] += n; rep[bfs]["strings"] += 1
            c = clean(street)
            hit = reg.get(bfs, {}).get(key(c)) if c else None
            if hit:
                rep[bfs]["placed"] += n
                f.write("\t".join(esc(v) for v in (bfs, street, hit[0], hit[1], hit[2])) + "\n")
    json.dump(rep, open(f"{out}/streets_report.json", "w"), indent=1)
    for bfs, v in sorted(rep.items()):
        print(f'streets {bfs}: {v["strings"]} strings, {v["placed"]} of {v["entries"]} entries with a street placed ({100 * v["placed"] / max(v["entries"], 1):.1f} %)')


if __name__ == "__main__":
    main()

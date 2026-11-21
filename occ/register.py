"""Occupation register (epic #58, O-4/O-5): printed supplement -> normalised occupations and trades.

  register.py map SUPPLEMENTS.tsv OUT.tsv     one supplement per line (COPY text format) -> supplement, {ids}
  register.py table OUT.tsv                   the register itself, for the table occupation_register

register.tsv has one row per normalised occupation (kind "beruf") or trade (kind "gewerbe"): id, kind, one of the
16 coarse classes, the name in German, French and Italian, and a pattern of stems and abbreviations. Patterns are
matched on the folded text (lower case, no accents: "Bäckerei" is written "backerei").

A supplement is cut at commas and semicolons. Parts that are an address, a note ("wenn keine Antwort ...") or the
mark of a second line are skipped, so that "Bäckerstr. 12" is no baker. All occupations found are kept, in the
order they stand in the text; the first is the main one.
"""
import csv, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
STREET = re.compile(r"(str\.|strasse|gasse\b|gassli|platz\b|weg\b|quai\b|\brue\b|\br\. ?[a-z]|\bav\.|\bavenue|\bch\. |\bchemin|\bbd\b|boulevard|\bpl\. |\brte\b|\bvia\b|\bpiazza|vorstadt|graben\b|rain\b|\bnr\.|\bno\.|\d+\s*$)")
FIRM = re.compile(r"(erei\b|erie\b|eria\b|geschaft|handlung|handlg|hdlg|fabrik|fabr\.|fabrique|magasin|a\.-?g\.|s\. ?a\.|& ?c(o|ie)|genossenschaft|societe|verein|gesellschaft|hotel|restaurant|gasthof|gasthaus|wirtschaft|pension|cafe|garage|bank|banque|apotheke|pharmacie|drogerie|salon|atelier|bureau|buro|institut|anstalt|verwaltung|kanzlei|depot|lager|agence|agentur|werkstatte|muhle|sagerei|brauerei)")
NOTE = re.compile(r"(wenn keine antwort|si non reponse|se non risponde|\(\d|\d\.\d\d|\btel\b|siehe |voir |vedi )")
SUBLINE = re.compile(r"^(wohn(g|ung)?|privat(wohnung)?|priv|appart(ement)?|app|domicile|dom|abitazione|abit)\.?$")


def fold(s):
    s = s.lower().replace("ß", "ss").replace("’", "'")
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))


def load():
    rows = list(csv.DictReader(open(os.path.join(HERE, "register.tsv"), encoding="utf-8"), delimiter="\t", quoting=csv.QUOTE_NONE))
    for r in rows: r["rx"] = re.compile(r["pattern"])
    return rows


REG = load()


def match(text):
    """Ids of the occupations and trades in a supplement, in the order they stand."""
    out = []; offset = 0
    for part in re.split(r"[,;]", fold(text)):
        p = part.strip(" .()")
        skip = not p or SUBLINE.match(p) or NOTE.search(p) or (STREET.search(p) and not FIRM.search(p))
        if not skip:
            for r in REG:
                m = r["rx"].search(p)
                if m: out.append((offset + m.start(), r["id"]))
        offset += len(part) + 1
    seen = []
    for _, i in sorted(out):
        if i not in seen: seen.append(i)
    return seen


def unescape(v):   # COPY text format
    return v.replace("\\t", "\t").replace("\\n", "\n").replace("\\r", "\r").replace("\\\\", "\\")


def main():
    if sys.argv[1] == "table":
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            for r in REG: f.write("\t".join(r[k] for k in ("id", "kind", "class", "de", "fr", "it")) + "\n")
        print(f"register: {len(REG)} rows")
    else:
        n = hit = 0
        with open(sys.argv[3], "w", encoding="utf-8") as f:
            for line in open(sys.argv[2], encoding="utf-8"):
                raw = line.rstrip("\n"); n += 1
                ids = match(unescape(raw))
                if ids: hit += 1; f.write(raw + "\t{" + ",".join(ids) + "}\n")
        print(f"supplements: {n} distinct, {hit} with an occupation or trade ({100 * hit / max(n, 1):.1f} %)")


if __name__ == "__main__":
    main()

"""Streets of the municipalities in street_towns.txt -> ref/streets_official.csv (bfs, name, lat, lon).

  ref_streets.py STRASSENVERZEICHNIS.csv

The source is the official directory of streets of swisstopo ("Amtliches Strassenverzeichnis", open data, source to
be named: Federal Office of Topography swisstopo), CSV download from
https://data.geo.admin.ch/ch.swisstopo.amtliches-strassenverzeichnis/ . It has one point per street. Only the
streets of the listed municipalities are kept in the repository; rerun after adding a municipality.
"""
import csv, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def towns():
    out = {}
    for line in open(os.path.join(HERE, "street_towns.txt"), encoding="utf-8"):
        if line.strip() and not line.startswith("#"):
            bfs, name = line.rstrip("\n").split("\t")
            out[bfs] = name
    return out


def lv95_to_wgs84(e, n):
    """Approximation of swisstopo (about 1 m), LV95 -> WGS84."""
    y, x = (e - 2_600_000) / 1_000_000, (n - 1_200_000) / 1_000_000
    lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3
    lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3
    return round(lat * 100 / 36, 5), round(lon * 100 / 36, 5)


def main():
    want = towns(); rows = []
    for r in csv.DictReader(open(sys.argv[1], encoding="utf-8-sig"), delimiter=";"):
        if r["COM_FOSNR"] in want and r["STR_EASTING"] and r["STR_STATUS"] == "real":
            lat, lon = lv95_to_wgs84(float(r["STR_EASTING"]), float(r["STR_NORTHING"]))
            rows.append((int(r["COM_FOSNR"]), r["STN_LABEL"], lat, lon))
    rows.sort()
    with open(os.path.join(HERE, "ref", "streets_official.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n"); w.writerow(("bfs", "name", "lat", "lon")); w.writerows(rows)
    print(len(rows), "streets of", len(want), "municipalities")


if __name__ == "__main__":
    main()

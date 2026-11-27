#!/usr/bin/env bash
# Rebuild the tables `places` (#43) and `streets` (#46): export the locality strings per volume, resolve them,
# load the result; then the same for the street strings of the municipalities in geo/street_towns.txt.
# Connection from the usual PG* variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD). Needs python3 and psql.
#   geo/build.sh            run after every import or correction of `records`, like db/volumes.sql
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${GEO_OUT:-geo/out}
mkdir -p "$OUT"
psql -X -q -v ON_ERROR_STOP=1 -c "\copy (SELECT locality, file, min(year), count(*) FROM records WHERE locality IS NOT NULL AND btrim(locality) <> '' AND file IS NOT NULL AND year IS NOT NULL GROUP BY 1, 2) TO '$OUT/counts.tsv'"
# the same per network, for the names a volume holds twice ("Reinach" with "Aarg." and with "Bld.", #71)
psql -X -q -v ON_ERROR_STOP=1 -c "\copy (SELECT locality, file, network, count(*) FROM records WHERE locality IS NOT NULL AND btrim(locality) <> '' AND file IS NOT NULL AND year IS NOT NULL AND network IS NOT NULL AND btrim(network) <> '' GROUP BY 1, 2, 3) TO '$OUT/counts_net.tsv'"
python3 geo/build_places.py "$OUT/counts.tsv" "$OUT" "$OUT/counts_net.tsv" > "$OUT/build.log"
head -5 "$OUT/build.log"
tail -1 "$OUT/build.log"
psql -X -q -v ON_ERROR_STOP=1 -v placesfile="$OUT/places_load.tsv" -f db/places.sql
psql -X -q -v ON_ERROR_STOP=1 -v placesnetfile="$OUT/places_net_load.tsv" -f db/places_net.sql

# street points: the street strings of the entries the place table puts in the listed municipalities
TOWNS=$(grep -v '^#' geo/street_towns.txt | cut -f1 | paste -sd, -)
psql -X -q -v ON_ERROR_STOP=1 -c "\\copy (SELECT p.bfs, r.street, count(*) FROM records r JOIN (SELECT locality, file, NULL AS network, bfs FROM places UNION ALL SELECT locality, file, network, bfs FROM places_net) p ON p.locality = r.locality AND p.file = r.file AND (p.network IS NULL OR p.network = r.network) WHERE p.bfs IN ($TOWNS) AND r.street IS NOT NULL AND btrim(r.street) <> '' GROUP BY 1, 2) TO '$OUT/streets.tsv'"
python3 geo/build_streets.py "$OUT/streets.tsv" "$OUT"
psql -X -q -v ON_ERROR_STOP=1 -v streetsfile="$OUT/streets_load.tsv" -f db/streets.sql

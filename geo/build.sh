#!/usr/bin/env bash
# Rebuild the table `places` (#43): export the locality strings per volume, resolve them, load the result.
# Connection from the usual PG* variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD). Needs python3 and psql.
#   geo/build.sh            run after every import or correction of `records`, like db/volumes.sql
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${GEO_OUT:-geo/out}
mkdir -p "$OUT"
psql -X -q -v ON_ERROR_STOP=1 -c "\copy (SELECT locality, file, min(year), count(*) FROM records WHERE locality IS NOT NULL AND btrim(locality) <> '' AND file IS NOT NULL AND year IS NOT NULL GROUP BY 1, 2) TO '$OUT/counts.tsv'"
python3 geo/build_places.py "$OUT/counts.tsv" "$OUT" > "$OUT/build.log"
head -5 "$OUT/build.log"
psql -X -q -v ON_ERROR_STOP=1 -v placesfile="$OUT/places_load.tsv" -f db/places.sql

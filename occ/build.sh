#!/usr/bin/env bash
# Rebuild the occupation register and the map from supplement to occupations (#58): export the distinct
# supplements, match them with occ/register.py, load both tables. Then db/occupations_fill.sql writes the result
# into `records` (volume by volume on production). Connection from the usual PG* variables; needs python3, psql.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${OCC_OUT:-occ/out}
mkdir -p "$OUT"
psql -X -q -v ON_ERROR_STOP=1 -c "\copy (SELECT DISTINCT supplement FROM records WHERE supplement IS NOT NULL AND btrim(supplement) <> '') TO '$OUT/supplements.tsv'"
python3 occ/register.py table "$OUT/register.tsv"
python3 occ/register.py map "$OUT/supplements.tsv" "$OUT/map.tsv"
psql -X -q -v ON_ERROR_STOP=1 -v registerfile="$OUT/register.tsv" -v mapfile="$OUT/map.tsv" -f db/occupations.sql

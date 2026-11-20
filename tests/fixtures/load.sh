#!/usr/bin/env bash
# Load the fixture into a PostgreSQL 15 database.
# Connection comes from DATABASE_* (see .env.test), the same variables the app reads.
set -euo pipefail
cd "$(dirname "$0")"
export PGHOST="${DATABASE_HOST:-127.0.0.1}" PGPORT="${DATABASE_PORT:-55433}"
export PGDATABASE="${DATABASE_NAME:-phonebook_test}" PGUSER="${DATABASE_USER:-postgres}"
export PGPASSWORD="${DATABASE_PASSWORD:-test}"
psql -X -q -v ON_ERROR_STOP=1 -f schema.sql
psql -X -q -v ON_ERROR_STOP=1 -c "\copy records (entityname1, entityname2, supplement, street, locality, phonenumber, year, page, file, network, aggregatedcontent) from 'records.tsv'"
# entries of a re-read volume, with kind, title and alliance (#58)
psql -X -q -v ON_ERROR_STOP=1 -c "\copy records from 'records_1938.tsv'"
psql -X -q -v ON_ERROR_STOP=1 -f indexes.sql
# the per-volume summary, with the same script production uses
psql -X -q -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS volumes" -f ../../db/volumes.sql >/dev/null
# the place table for the map, with the same scripts production uses
GEO_OUT="$(mktemp -d)" ../../geo/build.sh >/dev/null
psql -X -t -c "select count(*) || ' place keys loaded' from places"
psql -X -t -c "select count(*) || ' rows loaded' from records"

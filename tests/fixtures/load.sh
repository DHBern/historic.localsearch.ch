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
# three entries of the surname Buser, so that the fixture knows it as a surname of its own: the rule for the
# wife's family name ("Buser-Hodel" -> Hodel) needs both halves to stand alone
psql -X -q -v ON_ERROR_STOP=1 -c "\\copy records (entityname1, entityname2, supplement, street, locality, phonenumber, year, page, file, network, aggregatedcontent) from 'records_buser.tsv'"
# entries of a re-read volume, with kind, title and alliance (#58)
psql -X -q -v ON_ERROR_STOP=1 -c "\copy records (entityname1, entityname2, supplement, street, locality, phonenumber, year, page, file, network, aggregatedcontent, kind, title, alliance) from 'records_1938.tsv'"
# a place name that one volume holds twice: Reinach in Aargau and in Baselland, told apart by the network (#71)
psql -X -q -v ON_ERROR_STOP=1 -c "\copy records (entityname1, entityname2, supplement, street, locality, phonenumber, year, page, file, network, aggregatedcontent, kind, title, alliance) from 'records_reinach.tsv'"
# a name of two places whose heading was read without its canton: 20 entries "Teufen" without a network in 1940;
# the volume of 1946 says that the Teufen in Appenzell is the large one (12 entries with "App.", 2 with "Zch."; #71)
psql -X -q -v ON_ERROR_STOP=1 -c "\\copy records (entityname1, entityname2, supplement, street, locality, phonenumber, year, page, file, network, aggregatedcontent) from 'records_teufen.tsv'"
# six entries whose name the text recognition misread ("Hodei" for "Hodel"), for the approximate search (#26)
psql -X -q -v ON_ERROR_STOP=1 -c "\\copy records (entityname1, entityname2, supplement, street, locality, phonenumber, year, page, file, network, aggregatedcontent) from 'records_approx.tsv'"
psql -X -q -v ON_ERROR_STOP=1 -f indexes.sql
# the per-volume summary, with the same script production uses
psql -X -q -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS volumes" -f ../../db/volumes.sql >/dev/null
# title, second line and wife's family name of the older volumes, by the rules production uses (#58).
# The fixture is small: a surname counts from 3 entries of its own.
psql -X -q -v ON_ERROR_STOP=1 -v min_count=3 -f ../../db/subscriber_info.sql >/dev/null
# the occupation register and the occupations of every entry, with the scripts production uses (#58)
OCC_OUT="$(mktemp -d)" ../../occ/build.sh >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -f ../../db/occupations_fill.sql >/dev/null
psql -X -t -c "select count(occupations) || ' entries with an occupation' from records"
# the place table for the map, with the same scripts production uses
GEO_OUT="$(mktemp -d)" ../../geo/build.sh >/dev/null
psql -X -t -c "select count(*) || ' place keys loaded' from places"
psql -X -t -c "select count(*) || ' place keys with a network loaded' from places_net"
psql -X -t -c "select count(*) || ' rows loaded' from records"

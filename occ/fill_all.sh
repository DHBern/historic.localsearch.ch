#!/usr/bin/env bash
# Write the occupations into `records`, volume by volume, with a VACUUM every 5 volumes (#58, O-5).
# Run after occ/build.sh. The role must be allowed to VACUUM the table (owner or member of the owner role).
# Stops at the first error, and if the database grows by more than $MAXGROW MB (default 1500).
set -euo pipefail
cd "$(dirname "$0")/.."
i=0
MAXGROW=${MAXGROW:-1500}
START=$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT pg_database_size(current_database())/1048576")
echo "$(date '+%H:%M:%S') start, database $START MB"
psql -X -At -c "SELECT file FROM volumes WHERE with_fields > 0 ORDER BY year, file" | while IFS= read -r v; do
  [ -z "$v" ] && continue
  i=$((i + 1))
  n=$(psql -X -At -v ON_ERROR_STOP=1 -v vol="$v" -f db/occupations_fill.sql | awk '/^UPDATE/{s+=$2} END{print s+0}')
  echo "$(date '+%H:%M:%S') $v $n"
  if [ $((i % 5)) -eq 0 ]; then
    psql -X -q -v ON_ERROR_STOP=1 -c "VACUUM records"
    NOW=$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT pg_database_size(current_database())/1048576")
    echo "$(date '+%H:%M:%S') database $NOW MB"
    if [ $((NOW - START)) -gt "$MAXGROW" ]; then echo "STOP: the database grew by $((NOW - START)) MB"; exit 1; fi
  fi
done
psql -X -q -c "VACUUM records"
psql -X -At -F ' | ' -c "SELECT count(occupations) AS with_occupation, count(*) AS total, pg_size_pretty(pg_database_size(current_database())) FROM records"
echo "FILL DONE"

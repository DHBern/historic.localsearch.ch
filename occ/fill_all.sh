#!/usr/bin/env bash
# Write the occupations into `records`, volume by volume, with a VACUUM every 15 volumes (#58, O-5).
# Run after occ/build.sh. The role must be allowed to VACUUM the table (owner or member of the owner role).
# Stops at the first error.
set -euo pipefail
cd "$(dirname "$0")/.."
i=0
psql -X -At -c "SELECT file FROM volumes WHERE with_fields > 0 ORDER BY year, file" | while IFS= read -r v; do
  [ -z "$v" ] && continue
  i=$((i + 1))
  n=$(psql -X -At -v ON_ERROR_STOP=1 -v vol="$v" -f db/occupations_fill.sql | awk '/^UPDATE/{s+=$2} END{print s+0}')
  echo "$(date '+%H:%M:%S') $v $n"
  if [ $((i % 15)) -eq 0 ]; then
    psql -X -q -c "VACUUM records"
    echo "$(date '+%H:%M:%S') database $(psql -X -At -c "SELECT pg_size_pretty(pg_database_size(current_database()))")"
  fi
done
psql -X -q -c "VACUUM records"
psql -X -At -F ' | ' -c "SELECT count(occupations) AS with_occupation, count(*) AS total, pg_size_pretty(pg_database_size(current_database())) FROM records"
echo "FILL DONE"

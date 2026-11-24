-- Epic #58, step O-5: write the occupations of occupation_map into records.occupations. Only rows whose value
-- changes are touched, so it can be run again after the register or the data changed. On production run it volume
-- by volume (-v vol=<file>) with a VACUUM in between: the first fill writes about three million rows.
--   psql -v ON_ERROR_STOP=1 -f db/occupations_fill.sql                        all volumes (test database)
--   psql -v ON_ERROR_STOP=1 -v vol=P-260-1_2_1932 -f db/occupations_fill.sql   one volume
\if :{?vol}
\else
  \set vol %
\endif
UPDATE records r SET occupations = m.occupations
  FROM occupation_map m
 WHERE r.file LIKE :'vol' AND r.supplement = m.supplement AND r.occupations IS DISTINCT FROM m.occupations;
-- supplements that no longer match anything
UPDATE records r SET occupations = NULL
 WHERE r.file LIKE :'vol' AND r.occupations IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM occupation_map m WHERE m.supplement = r.supplement);

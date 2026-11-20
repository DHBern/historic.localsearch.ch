-- Where the street strings are: street points for the map (#46). One row per municipality and street string that
-- could be placed, with the street's name of today and one point of it. Built by geo/build_streets.py for the
-- municipalities in geo/street_towns.txt; geo/build.sh calls this script. It replaces the whole content.
--   psql -v ON_ERROR_STOP=1 -v streetsfile=geo/out/streets_load.tsv -f db/streets.sql
BEGIN;
CREATE TABLE IF NOT EXISTS streets (
	bfs integer NOT NULL,
	-- the street field of an entry as printed, house number included
	street text NOT NULL,
	-- the street it stands for, and one point of it (house numbers are not placed)
	name text NOT NULL,
	lat real NOT NULL,
	lon real NOT NULL,
	PRIMARY KEY (bfs, street)
);
GRANT SELECT ON streets TO PUBLIC;
CREATE TEMP TABLE streets_load (LIKE streets) ON COMMIT DROP;
-- \copy takes no variables: build the command first
\set copy_streets '\\copy streets_load FROM ' :'streetsfile'
:copy_streets
-- an empty or broken file must not empty the table
SELECT count(*) > 0 AS ok FROM streets_load \gset
\if :ok
\else
  \echo 'ABORT: no rows in the file'
  ROLLBACK;
  \quit
\endif
DELETE FROM streets;
INSERT INTO streets SELECT * FROM streets_load;
ANALYZE streets;
SELECT bfs, count(*) AS street_strings, count(DISTINCT name) AS streets FROM streets GROUP BY bfs ORDER BY bfs;
COMMIT;

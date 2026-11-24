-- Epic #58, step O-5: the occupation register and the map from printed supplement to occupations, as tables.
-- Built outside the database by occ/register.py; occ/build.sh calls this script. It replaces the whole content of
-- both tables and does not touch `records`: db/occupations_fill.sql does that, volume by volume.
--   psql -v ON_ERROR_STOP=1 -v registerfile=occ/out/register.tsv -v mapfile=occ/out/map.tsv -f db/occupations.sql
BEGIN;
CREATE TABLE IF NOT EXISTS occupation_register (
	id text PRIMARY KEY,
	-- 'beruf' (what a person is) or 'gewerbe' (a trade or business)
	kind text NOT NULL,
	-- one of the 16 coarse classes
	class text NOT NULL,
	de text NOT NULL,
	fr text NOT NULL,
	it text NOT NULL
);
CREATE TABLE IF NOT EXISTS occupation_map (
	supplement text NOT NULL,
	occupations text[] NOT NULL
);
GRANT SELECT ON occupation_register, occupation_map TO PUBLIC;
CREATE TEMP TABLE register_load (LIKE occupation_register) ON COMMIT DROP;
CREATE TEMP TABLE map_load (LIKE occupation_map) ON COMMIT DROP;
\set copy_register '\\copy register_load FROM ' :'registerfile'
:copy_register
\set copy_map '\\copy map_load FROM ' :'mapfile'
:copy_map
SELECT (SELECT count(*) FROM register_load) > 0 AND (SELECT count(*) FROM map_load) > 0 AS ok \gset
\if :ok
\else
  \echo 'ABORT: an input file is empty'
  ROLLBACK;
  \quit
\endif
DELETE FROM occupation_register;
INSERT INTO occupation_register SELECT * FROM register_load;
TRUNCATE occupation_map;
INSERT INTO occupation_map SELECT * FROM map_load;
ANALYZE occupation_map;
SELECT (SELECT count(*) FROM occupation_register) AS occupations, (SELECT count(*) FROM occupation_map) AS supplements;
COMMIT;

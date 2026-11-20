-- Where the locality strings are: what the map reads (#42, #43). One row per locality string and volume that could
-- be placed, with the municipality of today and a point. Built outside the database by geo/build_places.py;
-- geo/build.sh exports the strings, runs the builder and calls this script. Run it after every import or
-- correction of `records`; it replaces the whole content.
--   psql -v ON_ERROR_STOP=1 -v placesfile=geo/out/places_load.tsv -f db/places.sql
BEGIN;
CREATE TABLE IF NOT EXISTS places (
	locality text NOT NULL,
	file text NOT NULL,
	-- the place the string was resolved to, and the municipality of today it lies in
	name text NOT NULL,
	bfs integer NOT NULL,
	municipality text NOT NULL,
	canton text NOT NULL,
	-- point of the municipality (the circle on the map), and of the place itself
	lat real NOT NULL,
	lon real NOT NULL,
	place_lat real NOT NULL,
	place_lon real NOT NULL,
	-- how it was found, and how far to trust it: high, medium, low (see geo/build_places.py)
	method text NOT NULL,
	confidence text NOT NULL,
	PRIMARY KEY (locality, file)
);
GRANT SELECT ON places TO PUBLIC;
CREATE TEMP TABLE places_load (LIKE places) ON COMMIT DROP;
-- \copy takes no variables: build the command first
\set copy_places '\\copy places_load FROM ' :'placesfile'
:copy_places
-- an empty or broken file must not empty the table
SELECT count(*) > 0 AS ok FROM places_load \gset
\if :ok
\else
  \echo 'ABORT: no rows in the file'
  ROLLBACK;
  \quit
\endif
DELETE FROM places;
INSERT INTO places SELECT * FROM places_load;
ANALYZE places;
SELECT count(*) AS keys, count(DISTINCT bfs) AS municipalities FROM places;
-- share of the entries with a locality that the table places
SELECT count(*) AS entries_with_locality, count(p.bfs) AS placed,
       round(100.0 * count(p.bfs) / greatest(count(*), 1), 1) AS percent
  FROM records r LEFT JOIN places p ON p.locality = r.locality AND p.file = r.file
 WHERE r.locality IS NOT NULL AND btrim(r.locality) <> '';
COMMIT;

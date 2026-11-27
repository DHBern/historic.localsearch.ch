-- Where a locality string is when its volume alone does not say: decided by the field network of the entry (#71).
-- "Reinach" stands in one volume with "Aarg.", "064", "Bld." and "061"; `places` (key: string and volume) leaves it
-- out, this table has one row per string, volume and network that could be placed. Same columns as `places` after
-- the key. Built by geo/build_places.py; geo/build.sh calls this script. It replaces the whole content.
--   psql -v ON_ERROR_STOP=1 -v placesnetfile=geo/out/places_net_load.tsv -f db/places_net.sql
BEGIN;
CREATE TABLE IF NOT EXISTS places_net (
	locality text NOT NULL,
	file text NOT NULL,
	network text NOT NULL,
	name text NOT NULL,
	bfs integer NOT NULL,
	municipality text NOT NULL,
	canton text NOT NULL,
	lat real NOT NULL,
	lon real NOT NULL,
	place_lat real NOT NULL,
	place_lon real NOT NULL,
	method text NOT NULL,
	confidence text NOT NULL,
	PRIMARY KEY (locality, file, network)
);
GRANT SELECT ON places_net TO PUBLIC;
CREATE TEMP TABLE places_net_load (LIKE places_net) ON COMMIT DROP;
\set copy_places_net '\\copy places_net_load FROM ' :'placesnetfile'
:copy_places_net
-- a key of `places` needs no second answer
SELECT count(*) = 0 AS ok FROM places_net_load n JOIN places p ON p.locality = n.locality AND p.file = n.file \gset
\if :ok
\else
  \echo 'ABORT: rows for keys that the table places already has'
  ROLLBACK;
  \quit
\endif
DELETE FROM places_net;
INSERT INTO places_net SELECT * FROM places_net_load;
ANALYZE places_net;
SELECT count(*) AS keys_with_network FROM places_net;
SELECT count(*) AS entries_placed_by_network
  FROM records r JOIN places_net n ON n.locality = r.locality AND n.file = r.file AND n.network = r.network;
COMMIT;

-- Entries per municipality of today and year, for the map of the network without a search (#6).
-- Counting 11 million rows per request is too slow, so the page reads these small tables instead.
--   place_year      entries per year and municipality (BFS number); bfs 0 holds the entries of the year that are
--                   not on the map: no locality (volumes without fields), or a locality that could not be placed
--   municipalities  name, canton and point of every municipality the place tables know
-- Needs `places` and `places_net` (geo/build.sh): run it after them. It replaces the whole content.
BEGIN;
CREATE TABLE IF NOT EXISTS place_year (
	year integer NOT NULL,
	bfs integer NOT NULL,
	entries integer NOT NULL,
	PRIMARY KEY (year, bfs)
);
CREATE INDEX IF NOT EXISTS place_year_bfs ON place_year (bfs);
CREATE TABLE IF NOT EXISTS municipalities (
	bfs integer PRIMARY KEY,
	name text NOT NULL,
	canton text NOT NULL,
	lat real NOT NULL,
	lon real NOT NULL
);
GRANT SELECT ON place_year, municipalities TO PUBLIC;
DELETE FROM place_year;
INSERT INTO place_year
SELECT r.year, coalesce(p.bfs, n.bfs, 0), count(*)
FROM records r
LEFT JOIN places p ON p.locality = r.locality AND p.file = r.file
LEFT JOIN places_net n ON n.locality = r.locality AND n.file = r.file
	AND n.network = CASE WHEN r.network IS NULL OR btrim(r.network) = '' THEN '' ELSE r.network END
WHERE r.year IS NOT NULL AND r.file IS NOT NULL
GROUP BY 1, 2;
DELETE FROM municipalities;
INSERT INTO municipalities
SELECT bfs, min(municipality), min(canton), min(lat), min(lon)
FROM (SELECT bfs, municipality, canton, lat, lon FROM places
      UNION ALL SELECT bfs, municipality, canton, lat, lon FROM places_net) x
GROUP BY bfs;
ANALYZE place_year;
ANALYZE municipalities;
SELECT count(*) AS rows, count(DISTINCT year) AS years, sum(entries) AS entries,
       sum(entries) FILTER (WHERE bfs <> 0) AS placed FROM place_year;
COMMIT;

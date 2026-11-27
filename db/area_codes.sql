-- The area code (Fernkennzahl) of a place, for the limit of a search to a network group (#50).
-- The volumes of 1938–1950 print the code with the heading of a place ("Reinach (Aarg.) 064"), and the re-reading
-- carries it to the entries under that heading: about a third to two thirds of the entries of a year have one in
-- `network`. The others get the code of their place: `place_codes` says which code the entries of a municipality
-- of today carry, if at least 80 % of them carry the same one. The volumes of 1930–1937 print no code; their
-- entries get the code their place has in 1938–1950.
--   place_codes  one row per municipality of today (BFS number) with its code
--   code_years   entries per year and code, for the suggestions of the form and the share it states
-- Needs `places` and `places_net` (geo/build.sh): run it after them. It replaces the whole content.
BEGIN;
CREATE TABLE IF NOT EXISTS place_codes (
	bfs integer PRIMARY KEY,
	code text NOT NULL,
	municipality text NOT NULL,
	-- entries of 1938–1950 that carry this code in the municipality
	entries integer NOT NULL
);
CREATE TABLE IF NOT EXISTS code_years (
	year integer NOT NULL,
	code text NOT NULL,
	entries integer NOT NULL,
	PRIMARY KEY (year, code)
);
GRANT SELECT ON place_codes, code_years TO PUBLIC;
CREATE TEMP TABLE code_own ON COMMIT DROP AS
SELECT p.bfs, min(p.municipality) AS municipality, substring(r.network from '\m0\d\d\M') AS code, count(*) AS n
FROM records r JOIN places p ON p.locality = r.locality AND p.file = r.file
WHERE r.year >= 1938 AND r.network ~ '\m0\d\d\M' AND p.confidence <> 'low'
GROUP BY p.bfs, 3;
DELETE FROM place_codes;
INSERT INTO place_codes
SELECT bfs, code, municipality, n
FROM (
	SELECT *, sum(n) OVER (PARTITION BY bfs) AS total, row_number() OVER (PARTITION BY bfs ORDER BY n DESC, code) AS k
	FROM code_own
) c
WHERE k = 1 AND total >= 3 AND n >= 0.8 * total;
DELETE FROM code_years;
INSERT INTO code_years
SELECT year, code, count(*)
FROM (
	SELECT r.year,
	       coalesce(substring(r.network from '\m0\d\d\M'),
	                (SELECT c.code FROM place_codes c WHERE c.bfs = coalesce(p.bfs, n.bfs))) AS code
	FROM records r
	LEFT JOIN places p ON p.locality = r.locality AND p.file = r.file
	LEFT JOIN places_net n ON n.locality = r.locality AND n.file = r.file AND n.network = r.network
	WHERE r.year >= 1930
) e
WHERE code IS NOT NULL
GROUP BY year, code;
ANALYZE place_codes;
SELECT count(*) AS municipalities_with_a_code, count(DISTINCT code) AS codes FROM place_codes;
SELECT c.year, c.entries AS with_code, v.entries, round(100.0 * c.entries / v.entries) AS percent
FROM (SELECT year, sum(entries) AS entries FROM code_years GROUP BY year) c
JOIN (SELECT year, sum(entries) AS entries FROM volumes GROUP BY year) v USING (year)
ORDER BY c.year;
COMMIT;

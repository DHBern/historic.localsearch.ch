-- One row per phone-book volume: what the coverage page (/coverage) shows (#25).
-- Counting 8 million rows takes seconds, so the page reads this small table instead.
-- Run it after every import or correction of `records`; it replaces the whole content.
BEGIN;
CREATE TABLE IF NOT EXISTS volumes (
	file text PRIMARY KEY,
	year integer NOT NULL,
	entries integer NOT NULL,
	-- pages that have at least one entry, and the first and last of them
	pages integer NOT NULL,
	first_page integer,
	last_page integer,
	-- entries with a name field (the others are searchable as text only)
	with_fields integer NOT NULL,
	-- the three places with the most entries
	places text NOT NULL,
	updated timestamptz NOT NULL
);
GRANT SELECT ON volumes TO PUBLIC;
DELETE FROM volumes;
INSERT INTO volumes
SELECT v.file, v.year, v.entries, v.pages, v.first_page, v.last_page, v.with_fields,
       coalesce(p.places, ''), now()
FROM (
	SELECT file, min(year) AS year, count(*) AS entries, count(DISTINCT page) AS pages,
	       min(page) AS first_page, max(page) AS last_page, count(entityname1) AS with_fields
	FROM records
	WHERE file IS NOT NULL AND year IS NOT NULL
	GROUP BY file
) v
LEFT JOIN (
	SELECT file, string_agg(locality, ', ' ORDER BY n DESC, locality) AS places
	FROM (
		SELECT file, locality, count(*) AS n,
		       row_number() OVER (PARTITION BY file ORDER BY count(*) DESC, locality) AS r
		FROM records
		WHERE file IS NOT NULL AND locality IS NOT NULL AND btrim(locality) <> ''
		GROUP BY file, locality
	) t
	WHERE r <= 3
	GROUP BY file
) p USING (file);
SELECT count(*) AS volumes, sum(entries) AS entries FROM volumes;
COMMIT;

-- The books a search can be limited to (#50, #23): which volumes belong to which book.
--   until 1910  one book per telephone network (Basel, Bern, Zürich, ...); a book of two networks
--               ("Bern / Val-de-Travers") counts for both, so that "Bern" has no gap in those years
--   from 1911   the regional volumes 1 (west), 2 (centre and south) and 3 (east); the parts a, b and c of a
--               volume belong to it and can be chosen on their own
-- Built from the table `volumes`: run it after db/volumes.sql. It replaces the whole content.
BEGIN;
CREATE TABLE IF NOT EXISTS books (
	book text PRIMARY KEY,
	-- 'network' (until 1910) or 'volume' (from 1911)
	kind text NOT NULL,
	first_year integer NOT NULL,
	last_year integer NOT NULL,
	-- the years the book has volumes of, as printed ranges: "1911–1920, 1947–1950"
	years text NOT NULL,
	volumes integer NOT NULL,
	entries bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS book_files (
	book text NOT NULL,
	file text NOT NULL,
	PRIMARY KEY (book, file)
);
GRANT SELECT ON books, book_files TO PUBLIC;
DELETE FROM book_files;
DELETE FROM books;
WITH v AS (
	SELECT file, normalize(regexp_replace(regexp_replace(file, '^P-?260(-1)?_(P260-1_)?', ''), '_\d{4}(_\d)?$', ''), NFC) AS part
	FROM volumes
), town (part, book) AS (VALUES
	('Zuerich', 'Zürich'), ('Geneve', 'Genève'), ('Genève', 'Genève'), ('Lausann', 'Lausanne'), ('Neuchatel', 'Neuchâtel'),
	('St_Gallen', 'St. Gallen'), ('Chaux-de-Fonds', 'La Chaux-de-Fonds'), ('NetzgruppeBern', 'Bern'),
	('Bern_Biel', 'Bern'), ('Bern_Biel', 'Biel'), ('Bern_Burgdorf', 'Bern'), ('Bern_Burgdorf', 'Burgdorf'),
	('Bern_Thun', 'Bern'), ('Bern_Thun', 'Thun'), ('Bern_ValdeTravers', 'Bern'),
	('Bern_ValdeTravers', 'Val-de-Travers'), ('Geneve_Lausanne', 'Genève'), ('Geneve_Lausanne', 'Lausanne')
)
INSERT INTO book_files (book, file)
SELECT substring(part from '^\d'), file FROM v WHERE part ~ '^\d[abc]?$'
UNION
SELECT part, file FROM v WHERE part ~ '^\d[abc]$'
UNION
SELECT t.book, v.file FROM v JOIN town t USING (part)
UNION
-- a network the list above does not know keeps the name of its file
SELECT replace(part, '_', ' '), file FROM v
WHERE part !~ '^\d[abc]?$' AND NOT EXISTS (SELECT 1 FROM town t WHERE t.part = v.part);
INSERT INTO books
SELECT b.book, CASE WHEN b.book ~ '^\d[abc]?$' THEN 'volume' ELSE 'network' END,
       min(v.year), max(v.year),
       (
           -- runs of years without a gap
           SELECT string_agg(CASE WHEN lo = hi THEN lo::text ELSE lo || '–' || hi END, ', ' ORDER BY lo)
           FROM (
               SELECT min(year) AS lo, max(year) AS hi
               FROM (
                   SELECT year, year - row_number() OVER (ORDER BY year) AS run
                   FROM (SELECT DISTINCT v2.year FROM book_files b2 JOIN volumes v2 USING (file) WHERE b2.book = b.book) y
               ) r
               GROUP BY run
           ) runs
       ),
       count(*), sum(v.entries)
FROM book_files b JOIN volumes v USING (file)
GROUP BY b.book;
SELECT kind, count(*) AS books, sum(volumes) AS volumes FROM books GROUP BY kind ORDER BY kind;
COMMIT;

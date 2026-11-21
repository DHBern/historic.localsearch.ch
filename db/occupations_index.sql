-- Epic #58, step O-5: the index the occupation search uses. Needs the owner of the table; CONCURRENTLY, so the
-- site keeps answering while it is built (not inside a transaction).
--   psql -v ON_ERROR_STOP=1 -f db/occupations_index.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_occupations ON records USING gin (occupations);
ANALYZE records;

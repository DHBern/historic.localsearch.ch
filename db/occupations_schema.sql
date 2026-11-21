-- Epic #58, step O-5: a column for the normalised occupations of an entry. Needs the owner of the table.
-- Adding a nullable column does not rewrite the table. The index is created after the first fill
-- (db/occupations_index.sql), so that the fill does not have to maintain it row by row.
--   psql -v ON_ERROR_STOP=1 -f db/occupations_schema.sql
ALTER TABLE records ADD COLUMN IF NOT EXISTS occupations text[];
COMMENT ON COLUMN records.occupations IS 'ids of the normalised occupations and trades found in the supplement, in text order (occupation_register, #58)';

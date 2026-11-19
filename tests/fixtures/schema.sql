-- The table as it exists in production (one table, no key), with the
-- trigram indexes the search relies on.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DROP TABLE IF EXISTS records;
CREATE TABLE records (
	entityname1 text,
	entityname2 text,
	supplement text,
	street text,
	locality text,
	phonenumber text,
	year integer,
	page integer,
	file text,
	network text,
	aggregatedcontent text
);

CREATE INDEX idx_trgm_aggregatedcontent ON records USING gin (aggregatedcontent gin_trgm_ops);
CREATE INDEX idx_trgm_entityname1 ON records USING gin (entityname1 gin_trgm_ops);
CREATE INDEX idx_trgm_entityname2 ON records USING gin (entityname2 gin_trgm_ops);
CREATE INDEX idx_trgm_locality ON records USING gin (locality gin_trgm_ops);
CREATE INDEX idx_trgm_phonenumber ON records USING gin (phonenumber gin_trgm_ops);
CREATE INDEX idx_trgm_street ON records USING gin (street gin_trgm_ops);
CREATE INDEX idx_trgm_supplement ON records USING gin (supplement gin_trgm_ops);
CREATE INDEX idx_occupations ON records USING gin (occupations);
ANALYZE records;

BEGIN;
CREATE INDEX posts_search_idx ON posts USING GIN (to_tsvector('english',body)) WHERE hidden_at IS NULL;
COMMIT;

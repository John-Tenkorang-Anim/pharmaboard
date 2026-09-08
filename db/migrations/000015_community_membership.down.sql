DROP TABLE channel_members;
DROP INDEX IF EXISTS posts_channel_idx;
ALTER TABLE posts DROP COLUMN channel_id;

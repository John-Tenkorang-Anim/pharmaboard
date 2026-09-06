BEGIN;

DROP INDEX IF EXISTS users_display_name_trgm_idx;
DROP TABLE IF EXISTS content_reports;
ALTER TABLE IF EXISTS forum_threads DROP CONSTRAINT IF EXISTS forum_threads_accepted_reply_fk;
DROP TABLE IF EXISTS forum_replies;
DROP TABLE IF EXISTS forum_threads;
DROP TABLE IF EXISTS reactions;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS posts;

COMMIT;

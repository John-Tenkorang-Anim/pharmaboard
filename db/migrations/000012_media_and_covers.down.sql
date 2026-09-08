BEGIN;
DROP TABLE media_objects;
ALTER TABLE users DROP COLUMN cover_image;
COMMIT;

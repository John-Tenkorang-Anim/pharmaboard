BEGIN;
ALTER TABLE users ADD COLUMN cover_image text;
CREATE TABLE media_objects (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','video/mp4','video/webm')),
 data bytea NOT NULL CHECK(octet_length(data)<=20971520),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_objects_owner_idx ON media_objects(owner_id);
COMMIT;

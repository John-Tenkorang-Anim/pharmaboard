BEGIN;
CREATE TABLE library_items (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 url text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('book','article','video','reference')),
 notes text NOT NULL DEFAULT '',
 completed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_owner ON library_items(owner_id,created_at DESC);
COMMIT;

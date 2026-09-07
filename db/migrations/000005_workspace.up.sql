BEGIN;
CREATE TABLE workspace_resources (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('learning','jobs','sessions')),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 160),
 description text NOT NULL CHECK(char_length(description) BETWEEN 1 AND 8000),
 category text NOT NULL, organization text NOT NULL, location text NOT NULL DEFAULT '',
 url text NOT NULL, starts_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_resources_kind_idx ON workspace_resources(kind, created_at DESC, id);
CREATE TABLE workspace_saved (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 resource_id uuid NOT NULL REFERENCES workspace_resources(id) ON DELETE CASCADE,
 completed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(user_id, resource_id)
);
COMMIT;

BEGIN;
CREATE TABLE post_comments (
 id uuid PRIMARY KEY,
 post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES users(id),
 parent_id uuid,
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 UNIQUE(id, post_id),
 FOREIGN KEY(parent_id, post_id) REFERENCES post_comments(id, post_id)
);
CREATE INDEX post_comments_page_idx ON post_comments(post_id, created_at, id);
CREATE INDEX post_comments_count_idx ON post_comments(post_id) WHERE deleted_at IS NULL;
COMMIT;

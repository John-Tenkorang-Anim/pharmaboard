BEGIN;
CREATE TABLE profile_portfolio (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('about','experience','education','achievement','project','publication')),
 title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
 organization text NOT NULL DEFAULT '',
 period text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 url text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profile_portfolio_owner ON profile_portfolio(owner_id,created_at DESC,id);
CREATE TABLE profile_learning_visibility (
 owner_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 visible boolean NOT NULL DEFAULT false
);
COMMIT;

-- Fail safely if legacy addresses collide; never merge users automatically.
CREATE UNIQUE INDEX users_email_normalized_unique ON users (lower(trim(email))) WHERE email IS NOT NULL;
CREATE TABLE account_credentials (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 password_hash text,
 google_subject text UNIQUE,
 CHECK (password_hash IS NOT NULL OR google_subject IS NOT NULL)
);
CREATE TABLE login_attempts (
 contact_hash text PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 1,
 window_start timestamptz NOT NULL DEFAULT now()
);

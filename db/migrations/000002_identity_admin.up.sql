BEGIN;

-- Owned by identity: short-lived OTP challenges for phone/email verification
-- during login. Codes are stored hashed; plaintext never touches the database.
CREATE TABLE otp_challenges (
    id              uuid PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel         text NOT NULL CHECK (channel IN ('phone', 'email')),
    code_hash       bytea NOT NULL,
    attempts        smallint NOT NULL DEFAULT 0,
    expires_at      timestamptz NOT NULL,
    consumed_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX otp_challenges_user_idx ON otp_challenges (user_id, created_at DESC);

-- Owned by identity: device-bound sessions backing bearer access tokens.
-- Tokens are stored hashed; only the hash is ever persisted or compared.
CREATE TABLE sessions (
    id              uuid PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id       uuid REFERENCES devices(id) ON DELETE SET NULL,
    token_hash      bytea NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz
);

CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

-- Owned by admin: least-privilege institutional roles. A user may hold more
-- than one role; the author/approver split for a given notice is enforced in
-- application logic (notices.approved_by <> notices.publisher_id).
CREATE TABLE publisher_roles (
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('author', 'approver', 'publisher_admin', 'auditor')),
    granted_by      uuid REFERENCES users(id),
    granted_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role)
);

COMMIT;

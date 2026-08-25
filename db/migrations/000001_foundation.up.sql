BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE regions (
    code        text PRIMARY KEY,
    name        text NOT NULL UNIQUE
);

CREATE TABLE users (
    id                  uuid PRIMARY KEY,
    account_kind        text NOT NULL CHECK (account_kind IN ('pharmacist', 'student', 'organisation')),
    display_name        text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
    phone_e164          text UNIQUE,
    email               text UNIQUE,
    practice_area       text,
    region_code         text REFERENCES regions(code),
    bio                 text CHECK (char_length(bio) <= 500),
    avatar_object_key   text,
    verification_state  text NOT NULL DEFAULT 'unverified'
                        CHECK (verification_state IN ('unverified', 'pending', 'verified', 'revoked')),
    council_reg_no      text,
    verified_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    version             bigint NOT NULL DEFAULT 1,
    CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX users_directory_idx
    ON users (region_code, practice_area)
    WHERE deleted_at IS NULL AND verification_state = 'verified';

CREATE TABLE devices (
    id              uuid PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform        text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    push_token_hash text,
    last_seen_at    timestamptz,
    app_version     text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notices (
    id              uuid PRIMARY KEY,
    publisher_id    uuid NOT NULL REFERENCES users(id),
    title           text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
    body_markdown   text NOT NULL,
    severity        text NOT NULL CHECK (severity IN ('info', 'advisory', 'urgent', 'critical')),
    state           text NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft', 'in_review', 'approved', 'published', 'withdrawn')),
    audience_rule   jsonb NOT NULL,
    audience_size   integer CHECK (audience_size >= 0),
    approved_by     uuid REFERENCES users(id),
    approved_at     timestamptz,
    published_at    timestamptz,
    withdrawn_at    timestamptz,
    supersedes_id   uuid REFERENCES notices(id),
    search_document tsvector GENERATED ALWAYS AS (
                        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                        setweight(to_tsvector('english', coalesce(body_markdown, '')), 'B')
                    ) STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    version         bigint NOT NULL DEFAULT 1,
    CHECK (approved_by IS NULL OR approved_by <> publisher_id),
    CHECK (state NOT IN ('published', 'withdrawn') OR published_at IS NOT NULL)
);

CREATE INDEX notices_search_idx ON notices USING gin (search_document);
CREATE INDEX notices_published_idx ON notices (published_at DESC) WHERE state = 'published';

-- One immutable recipient record per targeted user. Channel attempts are kept
-- separately so a push failure and an SMS success cannot overwrite each other.
CREATE TABLE notice_recipients (
    notice_id       uuid NOT NULL REFERENCES notices(id),
    user_id         uuid NOT NULL REFERENCES users(id),
    delivered_at    timestamptz,
    read_at         timestamptz,
    acknowledged_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (notice_id, user_id),
    CHECK (read_at IS NULL OR delivered_at IS NOT NULL),
    CHECK (acknowledged_at IS NULL OR read_at IS NOT NULL)
);

CREATE INDEX notice_recipients_unread_idx
    ON notice_recipients (notice_id, user_id)
    WHERE read_at IS NULL;

CREATE TABLE delivery_attempts (
    id              uuid PRIMARY KEY,
    notice_id       uuid NOT NULL,
    user_id         uuid NOT NULL,
    channel         text NOT NULL CHECK (channel IN ('push', 'sms', 'email', 'in_app')),
    state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending', 'claimed', 'accepted', 'delivered', 'retryable', 'failed')),
    attempt_no      smallint NOT NULL CHECK (attempt_no BETWEEN 1 AND 10),
    available_at    timestamptz NOT NULL DEFAULT now(),
    claimed_until   timestamptz,
    provider_ref    text,
    last_error_code text,
    accepted_at     timestamptz,
    delivered_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (notice_id, user_id, channel, attempt_no),
    FOREIGN KEY (notice_id, user_id)
        REFERENCES notice_recipients(notice_id, user_id)
);

CREATE INDEX delivery_attempts_work_idx
    ON delivery_attempts (available_at, id)
    WHERE state IN ('pending', 'retryable');

CREATE TABLE outbox_jobs (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    topic           text NOT NULL,
    payload         jsonb NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    available_at    timestamptz NOT NULL DEFAULT now(),
    attempts        smallint NOT NULL DEFAULT 0,
    claimed_until   timestamptz,
    completed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_jobs_work_idx
    ON outbox_jobs (available_at, id)
    WHERE completed_at IS NULL;

CREATE SEQUENCE change_sequence;

CREATE TABLE change_log (
    sequence_no     bigint PRIMARY KEY DEFAULT nextval('change_sequence'),
    entity_type     text NOT NULL,
    entity_id       uuid NOT NULL,
    operation       text NOT NULL CHECK (operation IN ('upsert', 'delete')),
    entity_version  bigint NOT NULL,
    audience_key    text,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (entity_type, entity_id, entity_version)
);

CREATE INDEX change_log_audience_idx ON change_log (audience_key, sequence_no);

CREATE TABLE sync_watermarks (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    safe_sequence   bigint NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
    key             text NOT NULL,
    user_id         uuid NOT NULL REFERENCES users(id),
    request_hash    bytea NOT NULL,
    response_status smallint,
    response_body   jsonb,
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys (expires_at);

CREATE TABLE audit_events (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id        uuid REFERENCES users(id),
    action          text NOT NULL,
    subject_type    text NOT NULL,
    subject_id      uuid,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

COMMIT;

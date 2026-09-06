BEGIN;

-- Owned by messaging (see docs/adr/0004-early-messaging-and-video.md).
-- Direct conversations always have exactly 2 active participants; group
-- conversations are capped at 20 by application logic (small professional
-- threads, not a second broadcast mechanism — that's notices' job).
CREATE TABLE conversations (
    id              uuid PRIMARY KEY,
    kind            text NOT NULL CHECK (kind IN ('direct', 'group')),
    title           text CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 120),
    created_by      uuid NOT NULL REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz,
    CHECK (kind = 'direct' OR title IS NOT NULL)
);

CREATE TABLE conversation_participants (
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id),
    added_by        uuid REFERENCES users(id),
    joined_at       timestamptz NOT NULL DEFAULT now(),
    left_at         timestamptz,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX conversation_participants_active_idx
    ON conversation_participants (user_id)
    WHERE left_at IS NULL;

-- Append-only, matching the conflict policy already fixed for posts and
-- comments in docs/technical-design.md section 10. 'system' messages
-- (e.g. "X started a video call") share this table so they appear inline
-- in normal pagination instead of needing a second read path.
CREATE TABLE messages (
    id              uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    sender_id       uuid REFERENCES users(id),
    kind            text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'system')),
    body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,
    CHECK (kind = 'text' OR sender_id IS NULL)
);

CREATE INDEX messages_conversation_idx ON messages (conversation_id, id);

-- One immutable receipt row per (message, recipient), same shape as
-- notice_recipients: delivered/read are monotonic-maximum timestamps set
-- by the recipient's own client, never edited backward.
CREATE TABLE message_receipts (
    message_id      uuid NOT NULL REFERENCES messages(id),
    user_id         uuid NOT NULL REFERENCES users(id),
    delivered_at    timestamptz,
    read_at         timestamptz,
    PRIMARY KEY (message_id, user_id),
    CHECK (read_at IS NULL OR delivered_at IS NOT NULL)
);

-- One row per video call attached to a conversation. PharmaBoard only
-- brokers the room slug; the call itself runs on a third-party provider
-- (see ADR-0004) that this table's `provider` column names explicitly so
-- it is never ambiguous which infrastructure is actually relaying media.
CREATE TABLE call_sessions (
    id              uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    started_by      uuid NOT NULL REFERENCES users(id),
    provider        text NOT NULL CHECK (provider IN ('jitsi_public')),
    room_slug       text NOT NULL UNIQUE,
    started_at      timestamptz NOT NULL DEFAULT now(),
    ended_at        timestamptz
);

CREATE INDEX call_sessions_conversation_idx ON call_sessions (conversation_id, started_at DESC);

COMMIT;

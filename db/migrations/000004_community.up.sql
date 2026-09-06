BEGIN;

-- Owned by community: the professional feed, the Rx Forum, follows,
-- reactions, and moderation state (docs/technical-design.md sections 8, 14).
--
-- Two decisions worth stating up front, because both are constrained by the
-- design doc rather than by taste:
--
--  1. There is exactly one reaction kind ('endorse') and its count is public
--     and unweighted. Section 2, correction 7 rejects weighted professional
--     votes: verification is visible context beside a post, never a hidden
--     multiplier on its score. Do not add a "verified users count double"
--     mechanic here.
--  2. Ranking is chronological. No ML ranking, no engagement scoring, no paid
--     boosting (section 3 non-goals, section 14). last_activity_at exists so
--     the forum can sort by recent discussion, which is a stated, explicable
--     rule — not a black box.

CREATE TABLE posts (
    id              uuid PRIMARY KEY,
    author_id       uuid NOT NULL REFERENCES users(id),
    body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    reaction_count  integer NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    -- Moderation hides content; it never hard-deletes it, so an appeal can
    -- be reviewed and the audit trail stays intact (section 13).
    hidden_at       timestamptz,
    hidden_reason   text
);

CREATE INDEX posts_feed_idx ON posts (id DESC) WHERE hidden_at IS NULL;
CREATE INDEX posts_author_idx ON posts (author_id, id DESC) WHERE hidden_at IS NULL;

CREATE TABLE follows (
    follower_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id <> followee_id)
);

CREATE INDEX follows_followee_idx ON follows (followee_id);

-- Idempotent desired state, matching the conflict policy in section 10:
-- the primary key makes a repeated "react" a no-op rather than a duplicate.
CREATE TABLE reactions (
    subject_type    text NOT NULL CHECK (subject_type IN ('post', 'thread', 'reply')),
    subject_id      uuid NOT NULL,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            text NOT NULL DEFAULT 'endorse' CHECK (kind = 'endorse'),
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (subject_type, subject_id, user_id)
);

CREATE TABLE forum_threads (
    id                uuid PRIMARY KEY,
    author_id         uuid NOT NULL REFERENCES users(id),
    title             text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
    body              text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
    tags              text[] NOT NULL DEFAULT '{}',
    accepted_reply_id uuid,
    reply_count       integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
    reaction_count    integer NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_activity_at  timestamptz NOT NULL DEFAULT now(),
    hidden_at         timestamptz,
    hidden_reason     text,
    search_document   tsvector GENERATED ALWAYS AS (
                          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                          setweight(to_tsvector('english', coalesce(body, '')), 'B')
                      ) STORED
);

CREATE INDEX forum_threads_search_idx ON forum_threads USING gin (search_document);
CREATE INDEX forum_threads_activity_idx ON forum_threads (last_activity_at DESC) WHERE hidden_at IS NULL;

CREATE TABLE forum_replies (
    id              uuid PRIMARY KEY,
    thread_id       uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_id       uuid NOT NULL REFERENCES users(id),
    body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
    reaction_count  integer NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    hidden_at       timestamptz,
    hidden_reason   text
);

CREATE INDEX forum_replies_thread_idx ON forum_replies (thread_id, id);

-- The accepted answer is an explicit, visible act by the thread author
-- (section 14), not an inferred "best" reply.
ALTER TABLE forum_threads
    ADD CONSTRAINT forum_threads_accepted_reply_fk
    FOREIGN KEY (accepted_reply_id) REFERENCES forum_replies(id);

-- Moderation must exist before community content does: shipping a feed with
-- no reporting path is the gap ADR-0004 already flagged for messaging.
CREATE TABLE content_reports (
    id              uuid PRIMARY KEY,
    subject_type    text NOT NULL CHECK (subject_type IN ('post', 'thread', 'reply')),
    subject_id      uuid NOT NULL,
    reporter_id     uuid NOT NULL REFERENCES users(id),
    reason          text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
    state           text NOT NULL DEFAULT 'open'
                    CHECK (state IN ('open', 'actioned', 'dismissed')),
    resolution      text,
    resolved_by     uuid REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz,
    -- One open report per person per item; repeated reports are not votes.
    UNIQUE (subject_type, subject_id, reporter_id)
);

CREATE INDEX content_reports_open_idx ON content_reports (created_at) WHERE state = 'open';

-- Directory search over display names. pg_trgm is already enabled by
-- 000001_foundation; this index makes ILIKE/similarity lookups cheap enough
-- to serve the "find a colleague" flow without a separate search engine.
CREATE INDEX users_display_name_trgm_idx ON users USING gin (display_name gin_trgm_ops);

COMMIT;

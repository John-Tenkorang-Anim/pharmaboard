BEGIN;
-- Posts can now be tagged into the same channels RxForum threads use — a
-- single taxonomy shared across both surfaces (docs discussion for this:
-- the "communities" concept in the redesigned Overview feed) rather than a
-- second, parallel grouping concept.
ALTER TABLE posts ADD COLUMN channel_id uuid REFERENCES forum_channels(id);
CREATE INDEX posts_channel_idx ON posts (channel_id, id DESC) WHERE hidden_at IS NULL;

-- "Communities you're part of": explicit, member-controlled, distinct from
-- authorship or thread/post activity in a channel.
CREATE TABLE channel_members (
    channel_id uuid NOT NULL REFERENCES forum_channels(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX channel_members_user_idx ON channel_members (user_id);
COMMIT;

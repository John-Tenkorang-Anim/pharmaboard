BEGIN;
-- created_by is nullable so the seeded starter channels below (no member
-- authored them) and any future platform-curated channel can exist without
-- a fake owning user.
CREATE TABLE forum_channels (
    id          uuid PRIMARY KEY,
    slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 60),
    name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
    created_by  uuid REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO forum_channels (id, slug, name, description) VALUES
    (gen_random_uuid(), 'general', 'General', 'Anything pharmacy-related that does not fit elsewhere yet.'),
    (gen_random_uuid(), 'clinical-pharmacy', 'Clinical Pharmacy', 'Dosing, interactions, and day-to-day clinical practice.'),
    (gen_random_uuid(), 'research', 'Research', 'Journal clubs, study design, and evidence-based practice.'),
    (gen_random_uuid(), 'career-and-study', 'Career & Study', 'Exams, career paths, and professional development.');

-- Nullable: existing threads predate channels and stay uncategorized
-- (shown under "General" in the UI) rather than being force-migrated.
ALTER TABLE forum_threads ADD COLUMN channel_id uuid REFERENCES forum_channels(id);
CREATE INDEX forum_threads_channel_idx ON forum_threads (channel_id, last_activity_at DESC) WHERE hidden_at IS NULL;
COMMIT;

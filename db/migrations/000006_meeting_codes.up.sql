BEGIN;
-- Human-readable meeting codes identify member-visible scheduled sessions.
CREATE UNIQUE INDEX workspace_meeting_code_idx
ON workspace_resources ((upper(right(replace(id::text, '-', ''), 12))))
WHERE kind = 'sessions';
COMMIT;

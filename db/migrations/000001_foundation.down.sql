BEGIN;

DROP TABLE IF EXISTS audit_events;
DROP FUNCTION IF EXISTS reject_audit_mutation();
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS sync_watermarks;
DROP TABLE IF EXISTS change_log;
DROP SEQUENCE IF EXISTS change_sequence;
DROP TABLE IF EXISTS outbox_jobs;
DROP TABLE IF EXISTS delivery_attempts;
DROP TABLE IF EXISTS notice_recipients;
DROP TABLE IF EXISTS notices;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS regions;

COMMIT;

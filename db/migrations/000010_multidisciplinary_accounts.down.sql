BEGIN;
ALTER TABLE users DROP COLUMN institution;
ALTER TABLE users DROP CONSTRAINT users_account_kind_check;
ALTER TABLE users ADD CONSTRAINT users_account_kind_check CHECK(account_kind IN ('pharmacist','student','organisation'));
COMMIT;

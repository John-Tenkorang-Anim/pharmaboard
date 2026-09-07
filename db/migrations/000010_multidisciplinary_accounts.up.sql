BEGIN;
ALTER TABLE users DROP CONSTRAINT users_account_kind_check;
ALTER TABLE users ADD CONSTRAINT users_account_kind_check CHECK(account_kind IN ('pharmacist','student','organisation','professional','educator'));
ALTER TABLE users ADD COLUMN institution text CHECK(char_length(institution)<=160);
COMMIT;

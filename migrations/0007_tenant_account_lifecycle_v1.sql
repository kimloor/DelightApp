-- DelightApp Tenant Account Lifecycle V1
-- Existing users remain active.

PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active','disabled'));

CREATE INDEX idx_users_account_status ON users(account_status);

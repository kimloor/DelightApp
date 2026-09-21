-- DelightApp Auth / Session Hardening V2
-- Forward-only, backward-compatible. Existing password hashes remain valid until successful login rehashes them.

PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN password_algo TEXT NOT NULL DEFAULT 'legacy_sha256'
  CHECK (password_algo IN ('legacy_sha256','pbkdf2_sha256'));

ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

-- Existing stateless tokens predate session_version and are treated as version 1.
-- Bump existing accounts once so all pre-V2 tokens are invalidated at rollout.
UPDATE users SET session_version=2;

CREATE TABLE auth_login_limits (
  key_hash TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_auth_login_limits_updated_at ON auth_login_limits(updated_at);

-- DelightApp Platform Administration Foundation
-- Additive only. Does not change existing property ownership/access mappings.

ALTER TABLE users ADD COLUMN platform_role TEXT NOT NULL DEFAULT 'normal'
  CHECK (platform_role IN ('normal','superadmin'));

CREATE INDEX idx_users_platform_role ON users(platform_role);

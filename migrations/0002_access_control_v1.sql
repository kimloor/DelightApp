-- DelightApp Multi-Tenant Access Control V1 — Phase A
-- Additive only: creates access-mapping tables and seeds current account mappings.
-- IMPORTANT: this migration does NOT enable scoped reads/writes or strict isolation.

PRAGMA foreign_keys = ON;

CREATE TABLE property_admins (
  property_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_role TEXT NOT NULL DEFAULT 'admin'
    CHECK (access_role IN ('owner','admin')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (property_id, user_id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_property_admins_user_id ON property_admins(user_id);
CREATE INDEX idx_property_admins_property_id ON property_admins(property_id);

CREATE TABLE tenant_accounts (
  user_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_tenant_accounts_tenant_id ON tenant_accounts(tenant_id);

-- Normalize current application roles.
UPDATE users SET role='admin' WHERE username IN ('kim','test');
UPDATE users SET role='tenant' WHERE username IN ('test02','pare');

-- Seed admin access to both current properties.
INSERT INTO property_admins (property_id,user_id,access_role,created_at)
SELECT p.id,u.id,
       CASE WHEN u.username='kim' THEN 'owner' ELSE 'admin' END,
       datetime('now')
FROM properties p
JOIN users u ON u.username IN ('kim','test')
WHERE p.name IN ('ภาณุภณแมนชั่น','ทีเอชแอล แมนชั่น');

-- Seed tenant-account bindings from the current sole tenant in each property.
-- If a property unexpectedly has more than one tenant row, this will violate
-- tenant_accounts.user_id uniqueness and stop rather than silently guessing.
INSERT INTO tenant_accounts (user_id,tenant_id,created_at)
SELECT u.id,t.id,datetime('now')
FROM users u
JOIN properties p ON p.name='ทีเอชแอล แมนชั่น'
JOIN rooms r ON r.property_id=p.id
JOIN tenants t ON t.room_id=r.id
WHERE u.username='test02';

INSERT INTO tenant_accounts (user_id,tenant_id,created_at)
SELECT u.id,t.id,datetime('now')
FROM users u
JOIN properties p ON p.name='ภาณุภณแมนชั่น'
JOIN rooms r ON r.property_id=p.id
JOIN tenants t ON t.room_id=r.id
WHERE u.username='pare';

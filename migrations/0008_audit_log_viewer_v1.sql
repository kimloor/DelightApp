-- DelightApp Audit Log Viewer V1
-- Add authoritative property scope to audit rows.

ALTER TABLE audit_logs ADD COLUMN property_id TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_audit_logs_property_created_at
  ON audit_logs(property_id, created_at DESC);

CREATE INDEX idx_audit_logs_action_created_at
  ON audit_logs(action, created_at DESC);

-- Safe historical backfill: only rows whose current referenced object can
-- still be resolved unambiguously. Unknown/deleted historical scope remains ''.

UPDATE audit_logs
SET property_id=affected_ids
WHERE property_id=''
  AND table_name='properties'
  AND affected_ids<>''
  AND instr(affected_ids, ',')=0
  AND EXISTS (SELECT 1 FROM properties p WHERE p.id=audit_logs.affected_ids);

UPDATE audit_logs
SET property_id=(SELECT r.property_id FROM rooms r WHERE r.id=audit_logs.affected_ids)
WHERE property_id=''
  AND table_name='rooms'
  AND affected_ids<>''
  AND instr(affected_ids, ',')=0
  AND EXISTS (SELECT 1 FROM rooms r WHERE r.id=audit_logs.affected_ids);

UPDATE audit_logs
SET property_id=(
  SELECT r.property_id
  FROM tenants t JOIN rooms r ON r.id=t.room_id
  WHERE t.id=audit_logs.affected_ids
)
WHERE property_id=''
  AND table_name='tenants'
  AND affected_ids<>''
  AND instr(affected_ids, ',')=0
  AND EXISTS (
    SELECT 1 FROM tenants t JOIN rooms r ON r.id=t.room_id
    WHERE t.id=audit_logs.affected_ids
  );

UPDATE audit_logs
SET property_id=(
  SELECT r.property_id
  FROM bills b JOIN rooms r ON r.id=b.room_id
  WHERE b.id=audit_logs.affected_ids
)
WHERE property_id=''
  AND table_name='bills'
  AND affected_ids<>''
  AND instr(affected_ids, ',')=0
  AND EXISTS (
    SELECT 1 FROM bills b JOIN rooms r ON r.id=b.room_id
    WHERE b.id=audit_logs.affected_ids
  );

UPDATE audit_logs
SET property_id=(
  SELECT r.property_id
  FROM deposits d JOIN rooms r ON r.id=d.room_id
  WHERE d.id=audit_logs.affected_ids
)
WHERE property_id=''
  AND table_name='deposits'
  AND affected_ids<>''
  AND instr(affected_ids, ',')=0
  AND EXISTS (
    SELECT 1 FROM deposits d JOIN rooms r ON r.id=d.room_id
    WHERE d.id=audit_logs.affected_ids
  );

UPDATE audit_logs
SET property_id=(
  SELECT r.property_id
  FROM receipts x JOIN rooms r ON r.id=x.room_id
  WHERE x.id=audit_logs.affected_ids
)
WHERE property_id=''
  AND table_name='receipts'
  AND affected_ids<>''
  AND instr(affected_ids, ',')=0
  AND EXISTS (
    SELECT 1 FROM receipts x JOIN rooms r ON r.id=x.room_id
    WHERE x.id=audit_logs.affected_ids
  );

UPDATE audit_logs
SET property_id=(
  SELECT r.property_id
  FROM room_layouts l JOIN rooms r ON r.id=l.room_id
  WHERE l.id=audit_logs.affected_ids
)
WHERE property_id=''
  AND table_name='room_layouts'
  AND affected_ids<>''
  AND instr(affected_ids, ',')=0
  AND EXISTS (
    SELECT 1 FROM room_layouts l JOIN rooms r ON r.id=l.room_id
    WHERE l.id=audit_logs.affected_ids
  );

UPDATE audit_logs
SET property_id=(
  SELECT r.property_id
  FROM tenant_accounts ta
  JOIN tenants t ON t.id=ta.tenant_id
  JOIN rooms r ON r.id=t.room_id
  WHERE ta.tenant_id=audit_logs.affected_ids
)
WHERE property_id=''
  AND table_name='tenant_accounts'
  AND affected_ids<>''
  AND instr(affected_ids, ',')=0
  AND EXISTS (
    SELECT 1
    FROM tenant_accounts ta
    JOIN tenants t ON t.id=ta.tenant_id
    JOIN rooms r ON r.id=t.room_id
    WHERE ta.tenant_id=audit_logs.affected_ids
  );

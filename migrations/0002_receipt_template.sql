-- Receipt designer template storage (per property).
-- Existing rows receive an empty JSON object; historical receipts remain unchanged.
ALTER TABLE properties ADD COLUMN receipt_template TEXT NOT NULL DEFAULT '{}';

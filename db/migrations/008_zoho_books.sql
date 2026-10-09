-- Zoho Books connection (one row) and the draft invoice made for each order.
CREATE TABLE zoho_connection (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  accounts_server TEXT NOT NULL,
  api_domain TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  organization_id TEXT,
  organization_name TEXT,
  connected_by TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN zoho_invoice_id TEXT;
ALTER TABLE orders ADD COLUMN zoho_invoice_number TEXT;
ALTER TABLE customers ADD COLUMN zoho_contact_id TEXT;

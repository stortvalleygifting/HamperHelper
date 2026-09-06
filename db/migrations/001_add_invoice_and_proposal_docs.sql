-- Additive columns needed by the app but not in the original schema.
-- Kept as a separate migration so db/schema.sql stays exactly as specified.

-- Orders need a persisted invoice number once they're included in a
-- "ready to invoice" export, so the same order is never assigned a second one.
ALTER TABLE orders ADD COLUMN invoice_number TEXT;

-- Proposals can carry a generated or uploaded document (docx). We store the
-- file on disk (see server/uploads) and keep a reference to it here, the same
-- way products/customers reference their photo/logo via a URL column.
ALTER TABLE proposals ADD COLUMN doc_name TEXT;
ALTER TABLE proposals ADD COLUMN doc_source TEXT; -- 'generated' | 'uploaded'
ALTER TABLE proposals ADD COLUMN doc_url TEXT;

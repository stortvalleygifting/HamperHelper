-- Last invoice status seen in Zoho Books (draft, sent, paid, void...). When it
-- moves on from draft the order is marked Invoice sent, once; unticking it by
-- hand afterwards sticks.
ALTER TABLE orders ADD COLUMN zoho_invoice_status TEXT;
UPDATE orders SET zoho_invoice_status = 'draft' WHERE zoho_invoice_id IS NOT NULL;

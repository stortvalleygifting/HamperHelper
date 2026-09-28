-- Orders: "Invoice sent" tick box, alongside "Ready to invoice".
ALTER TABLE orders ADD COLUMN invoice_sent BOOLEAN NOT NULL DEFAULT false;

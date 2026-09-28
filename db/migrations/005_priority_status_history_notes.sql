-- Order priority (High/Medium/Low) and a manual position within the
-- Production list, set by dragging orders around on that page.
ALTER TABLE orders ADD COLUMN priority TEXT NOT NULL DEFAULT 'Medium';
ALTER TABLE orders ADD COLUMN production_rank INTEGER;

-- Who created the order (username at the time, so it survives the account
-- being renamed or deleted).
ALTER TABLE orders ADD COLUMN created_by TEXT;

-- One row per status change (and one for the order being created).
CREATE TABLE order_status_history (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  staff_id TEXT,
  username TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);

-- Free-text notes on a hamper.
ALTER TABLE products ADD COLUMN notes TEXT NOT NULL DEFAULT '';

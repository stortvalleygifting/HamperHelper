-- Ribbon colours list (Colours page), picked from on the customer record.
CREATE TABLE colours (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hex TEXT NOT NULL DEFAULT '',
  rgb TEXT NOT NULL DEFAULT '',
  pantone TEXT NOT NULL DEFAULT ''
);

-- Orders can include individual items as well as hampers: a line has either
-- product_id (a hamper) or stock_id (an item).
ALTER TABLE order_items ADD COLUMN stock_id TEXT REFERENCES stock_items(id);
CREATE INDEX idx_order_items_stock_id ON order_items(stock_id);

-- Proposal status, and which proposal an order was made from.
ALTER TABLE proposals ADD COLUMN status TEXT NOT NULL DEFAULT 'Draft';
ALTER TABLE orders ADD COLUMN proposal_id TEXT REFERENCES proposals(id) ON DELETE SET NULL;

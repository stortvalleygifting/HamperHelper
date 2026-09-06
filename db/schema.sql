-- Stort Valley Gifting — Hamper Helper
-- Core schema, as specified for the Postgres migration.

-- Stock items (ingredients/components)
CREATE TABLE stock_items (
  id TEXT PRIMARY KEY,
  brand TEXT,
  item_name TEXT NOT NULL,
  category TEXT,
  is_veg BOOLEAN DEFAULT false,
  is_vegan BOOLEAN DEFAULT false,
  is_gluten_free BOOLEAN DEFAULT false,
  contains_nuts BOOLEAN DEFAULT false,
  cost NUMERIC(10,2),
  price NUMERIC(10,2),
  weight NUMERIC(10,3),
  vat TEXT,
  availability TEXT,
  qty_on_hand NUMERIC(10,2) DEFAULT 0,
  qty_on_order NUMERIC(10,2) DEFAULT 0
);

-- Packaging & shipping options
CREATE TABLE packaging_options (
  id TEXT PRIMARY KEY, size TEXT, price NUMERIC(10,2), weight NUMERIC(10,3), cost NUMERIC(10,2), vat TEXT
);
CREATE TABLE shipping_options (
  id TEXT PRIMARY KEY, label TEXT, price NUMERIC(10,2), vat TEXT
);

-- Lead/customer sources
CREATE TABLE sources (
  id TEXT PRIMARY KEY, label TEXT
);

-- Hampers (products)
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  packaging_id TEXT REFERENCES packaging_options(id),
  shipping_id TEXT REFERENCES shipping_options(id),
  photo_url TEXT
);
CREATE TABLE product_components (
  id SERIAL PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  component_id TEXT REFERENCES stock_items(id),
  qty NUMERIC(10,2),
  price NUMERIC(10,2)
);

-- Customers
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  source_id TEXT REFERENCES sources(id),
  contact_name TEXT, email TEXT, phone_primary TEXT, phone_secondary TEXT,
  contact_name2 TEXT, email2 TEXT, phone2_primary TEXT, phone2_secondary TEXT,
  ribbon_color TEXT, font_color TEXT, logo_url TEXT, notes TEXT
);

-- Orders
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  order_date DATE, delivery_date DATE,
  status TEXT, notes TEXT,
  ready_to_invoice BOOLEAN DEFAULT false,
  stock_deducted BOOLEAN DEFAULT false
);
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  qty INTEGER, qty_packed INTEGER DEFAULT 0, qty_shipped INTEGER DEFAULT 0
);

-- Proposals
CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  proposal_date DATE
);
CREATE TABLE proposal_hampers (
  id SERIAL PRIMARY KEY,
  proposal_id TEXT REFERENCES proposals(id) ON DELETE CASCADE,
  slot_index INTEGER,
  product_id TEXT REFERENCES products(id)
);

-- Default packaging & shipping options, matching the defaults the original
-- artifact seeded into local storage the first time it ran with none saved.
-- Safe to run once after db/schema.sql; skipped automatically if rows already
-- exist for that table.

INSERT INTO packaging_options (id, size, price, weight, cost, vat) VALUES
  ('pkg-mini',              'Mini',                6.5,  0.065, 3.5,  'Standard 20%'),
  ('pkg-small',             'Small',               11.5, 0.35,  5,    'Standard 20%'),
  ('pkg-medium',            'Medium',              17,   0.4,   7,    'Standard 20%'),
  ('pkg-large',             'Large',               20,   1,     10,   'Standard 20%'),
  ('pkg-none',              'None',                0,    0,     0,    'Standard 20%'),
  ('pkg-hamper',            'Hamper',              35,   1,     25,   'Standard 20%'),
  ('pkg-mini-shipped',      'Mini (Shipped)',      6.5,  0.35,  3.5,  'Standard 20%'),
  ('pkg-small-shipped',     'Small (Shipped)',     22.5, 0.58,  5,    'Standard 20%'),
  ('pkg-medium-shipped',    'Medium (Shipped)',    28,   0.805, 7,    'Standard 20%'),
  ('pkg-micro-shipped-rm',  'Micro (Shipped RM)',  5,    NULL,  NULL, 'Standard 20%'),
  ('pkg-mini-shipped-rm',   'Mini (Shipped RM)',   11.5, 0.065, 3.5,  'Standard 20%'),
  ('pkg-mini-courier',      'Mini (Courier)',      17.5, 0.065, 3.5,  'Standard 20%'),
  ('pkg-large-shipped',     'Large (Shipped)',     31,   1,     10,   'Standard 20%')
ON CONFLICT (id) DO NOTHING;

INSERT INTO shipping_options (id, label, price, vat) VALUES
  ('shp-mini',              'Mini',                6.5,  'Standard 20%'),
  ('shp-small',             'Small',               11.5, 'Standard 20%'),
  ('shp-medium',            'Medium',              17,   'Standard 20%'),
  ('shp-large',             'Large',               20,   'Standard 20%'),
  ('shp-none',              'None',                0,    'Standard 20%'),
  ('shp-hamper',            'Hamper',              35,   'Standard 20%'),
  ('shp-mini-shipped',      'Mini (Shipped)',      6.5,  'Standard 20%'),
  ('shp-small-shipped',     'Small (Shipped)',     22.5, 'Standard 20%'),
  ('shp-medium-shipped',    'Medium (Shipped)',    28,   'Standard 20%'),
  ('shp-micro-shipped-rm',  'Micro (Shipped RM)',  5,    'Standard 20%'),
  ('shp-mini-shipped-rm',   'Mini (Shipped RM)',   11.5, 'Standard 20%'),
  ('shp-mini-courier',      'Mini (Courier)',      17.5, 'Standard 20%'),
  ('shp-large-shipped',     'Large (Shipped)',     31,   'Standard 20%')
ON CONFLICT (id) DO NOTHING;

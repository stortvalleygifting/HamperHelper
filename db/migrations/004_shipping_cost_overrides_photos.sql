-- Shipping options get a cost, like packaging options already have, so a
-- hamper's total cost can include what shipping actually costs us.
ALTER TABLE shipping_options ADD COLUMN cost NUMERIC(10,2);

-- Optional manual override of a hamper's selling price, per VAT rate:
-- {"Standard 20%": 45.00, "Zero 0%": 12.50}. Amounts are inc VAT, like every
-- other price. A rate missing from the map uses the price calculated from
-- the hamper's items and packaging.
ALTER TABLE products ADD COLUMN price_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Hampers can have several photos. photo_url stays as the main (first) photo
-- so proposals and anything else reading it keep working.
ALTER TABLE products ADD COLUMN photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE products SET photo_urls = jsonb_build_array(photo_url) WHERE photo_url IS NOT NULL AND photo_url <> '';

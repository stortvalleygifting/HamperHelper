-- Foreign key columns are not automatically indexed in Postgres; add indexes
-- for the lookups the app does constantly (joins for totals, filtering by
-- customer/order, etc).
CREATE INDEX idx_product_components_product_id ON product_components(product_id);
CREATE INDEX idx_product_components_component_id ON product_components(component_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_customers_source_id ON customers(source_id);
CREATE INDEX idx_proposal_hampers_proposal_id ON proposal_hampers(proposal_id);
CREATE INDEX idx_proposals_customer_id ON proposals(customer_id);

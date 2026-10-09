-- Proposals get their own name (default "Customer - DD/MM/YYYY") and can
-- leave shipping out of the generated document.
ALTER TABLE proposals ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE proposals ADD COLUMN exclude_shipping BOOLEAN NOT NULL DEFAULT false;

UPDATE proposals p
SET name = COALESCE((SELECT c.company_name FROM customers c WHERE c.id = p.customer_id), 'Proposal')
  || ' - ' || to_char(COALESCE(p.proposal_date, CURRENT_DATE), 'DD/MM/YYYY');

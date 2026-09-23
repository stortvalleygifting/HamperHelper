// Server-side mirror of the frontend's VAT/pricing math in public/app.js,
// used only where the server itself needs a hamper's price breakdown (the
// ready-to-invoice export). Keep the two in sync if the pricing rules change.

export function vatRatePercent(vat) {
  if (!vat) return 0.2;
  const v = vat.toLowerCase();
  if (v.includes('20')) return 0.2;
  if (v.includes('5')) return 0.05;
  if (v.includes('zero')) return 0;
  if (v.includes('exempt')) return 0;
  return 0.2;
}

// Every price and cost is entered INCLUDING VAT, so ex-VAT figures are backed
// out of them rather than VAT being added on top. Profit is ex-VAT price minus
// ex-VAT cost. vatGroups maps a VAT rate label to
// the inc-VAT amount charged at that rate.
export function vatBreakdownFromGroups(vatGroups) {
  return Object.entries(vatGroups)
    .map(([rate, totalIncVat]) => {
      const pct = vatRatePercent(rate);
      const subtotal = totalIncVat / (1 + pct);
      return { rate, subtotal, vatAmount: totalIncVat - subtotal, totalIncVat };
    })
    .sort((a, b) => b.totalIncVat - a.totalIncVat);
}

function exVat(amount, rate) {
  return amount / (1 + vatRatePercent(rate));
}

// stockById/packagingById/shippingById are Maps keyed by id.
export function computeHamperTotals(product, stockById, packagingById, shippingById) {
  let cost = 0;
  let costExVat = 0;
  const vatGroups = {};
  (product.components || []).forEach((c) => {
    const s = stockById.get(c.componentId);
    if (!s) return;
    const qty = c.qty || 0;
    const linePrice = c.price != null ? c.price : s.price || 0;
    const rate = s.vat || 'Standard 20%';
    cost += (s.cost || 0) * qty;
    costExVat += exVat((s.cost || 0) * qty, rate);
    vatGroups[rate] = (vatGroups[rate] || 0) + linePrice * qty;
  });
  const pack = product.packagingId ? packagingById.get(product.packagingId) : null;
  if (pack) {
    const rate = pack.vat || 'Standard 20%';
    cost += pack.cost || 0;
    costExVat += exVat(pack.cost || 0, rate);
    vatGroups[rate] = (vatGroups[rate] || 0) + (pack.price || 0);
  }
  const ship = product.shippingId ? shippingById.get(product.shippingId) : null;
  if (ship) {
    const rate = ship.vat || 'Standard 20%';
    vatGroups[rate] = (vatGroups[rate] || 0) + (ship.price || 0);
  }
  const vatBreakdown = vatBreakdownFromGroups(vatGroups);
  const priceExVat = vatBreakdown.reduce((sum, v) => sum + v.subtotal, 0);
  const totalIncVat = vatBreakdown.reduce((sum, v) => sum + v.totalIncVat, 0);
  return { cost, costExVat, priceExVat, vatBreakdown, totalIncVat, profit: priceExVat - costExVat };
}

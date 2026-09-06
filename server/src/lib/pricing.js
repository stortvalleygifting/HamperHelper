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

// stockById/packagingById/shippingById are Maps keyed by id.
export function computeHamperTotals(product, stockById, packagingById, shippingById) {
  let cost = 0;
  let priceExVat = 0;
  const vatGroups = {};
  (product.components || []).forEach((c) => {
    const s = stockById.get(c.componentId);
    if (!s) return;
    const qty = c.qty || 0;
    const linePrice = c.price != null ? c.price : s.price || 0;
    cost += (s.cost || 0) * qty;
    priceExVat += linePrice * qty;
    const rate = s.vat || 'Standard 20%';
    vatGroups[rate] = (vatGroups[rate] || 0) + linePrice * qty;
  });
  const pack = product.packagingId ? packagingById.get(product.packagingId) : null;
  if (pack) {
    cost += pack.cost || 0;
    priceExVat += pack.price || 0;
    const rate = pack.vat || 'Standard 20%';
    vatGroups[rate] = (vatGroups[rate] || 0) + (pack.price || 0);
  }
  const ship = product.shippingId ? shippingById.get(product.shippingId) : null;
  if (ship) {
    priceExVat += ship.price || 0;
    const rate = ship.vat || 'Standard 20%';
    vatGroups[rate] = (vatGroups[rate] || 0) + (ship.price || 0);
  }
  const vatBreakdown = Object.entries(vatGroups)
    .map(([rate, subtotal]) => {
      const pct = vatRatePercent(rate);
      const vatAmount = subtotal * pct;
      return { rate, subtotal, vatAmount, totalIncVat: subtotal + vatAmount };
    })
    .sort((a, b) => b.subtotal - a.subtotal);
  const totalIncVat = vatBreakdown.reduce((sum, v) => sum + v.totalIncVat, 0);
  return { cost, priceExVat, vatBreakdown, totalIncVat, profit: priceExVat - cost };
}

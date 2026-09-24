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
// ex-VAT cost.
function exVat(amount, rate) {
  return amount / (1 + vatRatePercent(rate));
}

function breakdownLine(rate, totalIncVat, extra) {
  const subtotal = exVat(totalIncVat, rate);
  return { rate, subtotal, vatAmount: totalIncVat - subtotal, totalIncVat, isShipping: false, ...extra };
}

// priceOverrides key for the shipping line (the others are VAT rate labels).
export const SHIPPING_OVERRIDE_KEY = '__shipping';

// A hamper's price is one line per VAT rate for its goods (items + packaging),
// where the hamper's priceOverrides can replace a rate's calculated amount,
// plus a single separate line for shipping at the shipping option's own rate,
// which can also be overridden.
// stockById/packagingById/shippingById are Maps keyed by id.
export function computeHamperTotals(product, stockById, packagingById, shippingById) {
  let cost = 0;
  let costExVat = 0;
  const goods = {};
  (product.components || []).forEach((c) => {
    const s = stockById.get(c.componentId);
    if (!s) return;
    const qty = c.qty || 0;
    const linePrice = c.price != null ? c.price : s.price || 0;
    const rate = s.vat || 'Standard 20%';
    cost += (s.cost || 0) * qty;
    costExVat += exVat((s.cost || 0) * qty, rate);
    goods[rate] = (goods[rate] || 0) + linePrice * qty;
  });
  const pack = product.packagingId ? packagingById.get(product.packagingId) : null;
  if (pack) {
    const rate = pack.vat || 'Standard 20%';
    cost += pack.cost || 0;
    costExVat += exVat(pack.cost || 0, rate);
    goods[rate] = (goods[rate] || 0) + (pack.price || 0);
  }
  const overrides = product.priceOverrides || {};
  const vatBreakdown = Object.entries(goods)
    .map(([rate, calculated]) => {
      const overridden = overrides[rate] != null;
      return breakdownLine(rate, overridden ? Number(overrides[rate]) : calculated, { calculated, overridden });
    })
    .sort((a, b) => b.totalIncVat - a.totalIncVat);
  const ship = product.shippingId ? shippingById.get(product.shippingId) : null;
  if (ship) {
    const rate = ship.vat || 'Standard 20%';
    cost += ship.cost || 0;
    costExVat += exVat(ship.cost || 0, rate);
    const overridden = overrides[SHIPPING_OVERRIDE_KEY] != null;
    const amount = overridden ? Number(overrides[SHIPPING_OVERRIDE_KEY]) : ship.price || 0;
    vatBreakdown.push(breakdownLine(rate, amount, { isShipping: true, calculated: ship.price || 0, overridden }));
  }
  const priceExVat = vatBreakdown.reduce((sum, v) => sum + v.subtotal, 0);
  const totalIncVat = vatBreakdown.reduce((sum, v) => sum + v.totalIncVat, 0);
  return { cost, costExVat, priceExVat, vatBreakdown, totalIncVat, profit: priceExVat - costExVat };
}

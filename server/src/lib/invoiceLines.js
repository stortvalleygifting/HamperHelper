import { computeOrderLineUnit, vatRatePercent } from './pricing.js';

// The lines an order is invoiced with, shared by the CSV export and Zoho:
// one line per hamper per VAT rate (named "<hamper> - VAT 20%" when a hamper
// spans rates), a separate "<hamper> - shipping" line, and single items.
// Prices are per unit and include VAT. Lines with no quantity are left out.
// items: rows or API lines with productId/product_id and stockId/stock_id.
export function invoiceLinesForOrder(items, maps) {
  const lines = [];
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    if (qty <= 0) continue;
    const unit = computeOrderLineUnit({ productId: it.productId ?? it.product_id, stockId: it.stockId ?? it.stock_id }, maps);
    if (!unit) continue;
    const splitByRate = unit.totals.vatBreakdown.filter((v) => !v.isShipping).length > 1;
    for (const v of unit.totals.vatBreakdown) {
      const vatPct = Math.round(vatRatePercent(v.rate) * 100);
      const name = v.isShipping
        ? `${unit.name} - shipping`
        : splitByRate ? `${unit.name} - ${vatPct === 0 ? 'no VAT' : 'VAT ' + vatPct + '%'}` : unit.name;
      lines.push({ name, qty, unitPriceIncVat: Math.round(v.totalIncVat * 100) / 100, rate: v.rate, vatPct });
    }
  }
  return lines;
}

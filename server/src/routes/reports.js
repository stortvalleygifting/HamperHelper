import { Router } from 'express';
import { pool } from '../db.js';
import { listOrders } from './orders.js';
import { listProducts } from './products.js';
import { listStock } from './stock.js';
import { listPackaging } from './packaging.js';
import { listShipping } from './shipping.js';
import { listCustomers } from './customers.js';
import { computeHamperTotals, vatRatePercent } from '../lib/pricing.js';
import { toCsv } from '../lib/csv.js';

const router = Router();

const INVOICE_CSV_FIELDS = [
  'Invoice Date', 'Invoice Number', 'Invoice Status', 'Invoice VAT Treatment', 'Customer Name', 'Due Date',
  'PurchaseOrder', 'Template Name', 'Currency Code', 'Exchange Rate', 'Item Name', 'SKU', 'Item Desc',
  'Quantity', 'Item Type', 'Item Price', 'Is Inclusive Tax', 'Discount(%)', 'Item Tax', 'Item Tax %',
  'Item Tax Type', 'Notes', "Terms & Conditions", 'PayPal', 'Authorize.Net', 'Google Checkout', 'Warehouse Name',
];

const INVOICE_VAT_LABELS = { 'Standard 20%': 'Standard Rate', 'Reduced 5%': 'Reduced Rate', 'Zero 0%': 'Zero Rate', Exempt: 'Exempt' };

async function nextInvoiceNumber(client) {
  const { rows } = await client.query("SELECT invoice_number FROM orders WHERE invoice_number ~ '^INV-HH[0-9]{4}$'");
  let maxSeq = 0;
  for (const row of rows) {
    const m = /^INV-HH(\d{4})$/.exec(row.invoice_number);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return 'INV-HH' + String(maxSeq + 1).padStart(4, '0');
}

// Marks every order currently flagged "ready to invoice" as invoiced
// (assigning it a stable invoice number), and returns a CSV of the line
// items in the format the accounting import expects. Done as one
// transaction so a retried request can't double-assign invoice numbers.
router.post('/ready-to-invoice', async (req, res) => {
  const client = await pool.connect();
  let csv = null;
  let filename = null;
  try {
    await client.query('BEGIN');
    const { rows: dueOrders } = await client.query("SELECT * FROM orders WHERE ready_to_invoice = true FOR UPDATE");
    if (!dueOrders.length) {
      await client.query('ROLLBACK');
      return res.status(200).json({ csv: null, filename: null, message: 'No orders are marked ready to invoice', orders: await listOrders() });
    }

    const [products, stock, packaging, shipping, customers] = await Promise.all([
      listProducts(), listStock(), listPackaging(), listShipping(), listCustomers(),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const stockById = new Map(stock.map((s) => [s.id, s]));
    const packagingById = new Map(packaging.map((p) => [p.id, p]));
    const shippingById = new Map(shipping.map((s) => [s.id, s]));
    const customerById = new Map(customers.map((c) => [c.id, c]));

    const todayStr = new Date().toISOString().slice(0, 10);
    const rows = [];

    for (const order of dueOrders) {
      const invoiceNumber = order.invoice_number || (await nextInvoiceNumber(client));
      await client.query('UPDATE orders SET invoice_number = $1, ready_to_invoice = false WHERE id = $2', [invoiceNumber, order.id]);

      const { rows: items } = await client.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
      const cust = order.customer_id ? customerById.get(order.customer_id) : null;
      for (const it of items) {
        const product = it.product_id ? productById.get(it.product_id) : null;
        if (!product) continue;
        const totals = computeHamperTotals(product, stockById, packagingById, shippingById);
        const splitByRate = totals.vatBreakdown.length > 1;
        for (const v of totals.vatBreakdown) {
          const vatLabel = INVOICE_VAT_LABELS[v.rate] || v.rate;
          const vatPct = Math.round(vatRatePercent(v.rate) * 100);
          const itemName = splitByRate ? `${product.name} - ${vatPct === 0 ? 'no VAT' : 'VAT ' + vatPct + '%'}` : product.name;
          rows.push({
            'Invoice Date': todayStr,
            'Invoice Number': invoiceNumber,
            'Invoice Status': 'Draft',
            'Invoice VAT Treatment': 'uk',
            'Customer Name': cust ? cust.companyName : '',
            'Due Date': '',
            PurchaseOrder: '',
            'Template Name': '',
            'Currency Code': 'GBP',
            'Exchange Rate': 1,
            'Item Name': itemName,
            SKU: '',
            'Item Desc': '',
            Quantity: it.qty || 0,
            'Item Type': 'goods',
            'Item Price': v.totalIncVat.toFixed(2),
            'Is Inclusive Tax': 'TRUE',
            'Discount(%)': 0,
            'Item Tax': vatLabel,
            'Item Tax %': vatPct,
            'Item Tax Type': 'ItemAmount',
            Notes: order.notes || '',
            'Terms & Conditions': '',
            PayPal: '',
            'Authorize.Net': '',
            'Google Checkout': '',
            'Warehouse Name': '',
          });
        }
      }
    }

    if (rows.length) {
      csv = toCsv(INVOICE_CSV_FIELDS, rows);
      filename = `ready-to-invoice-${todayStr}.csv`;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ csv, filename, orders: await listOrders() });
});

export default router;

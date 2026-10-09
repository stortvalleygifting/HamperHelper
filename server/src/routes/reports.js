import { Router } from 'express';
import { pool } from '../db.js';
import { listOrders } from './orders.js';
import { listProducts } from './products.js';
import { listStock } from './stock.js';
import { listPackaging } from './packaging.js';
import { listShipping } from './shipping.js';
import { listCustomers } from './customers.js';
import { computeOrderLineUnit, vatRatePercent } from '../lib/pricing.js';
import { toCsv } from '../lib/csv.js';
import { invoiceLinesForOrder } from '../lib/invoiceLines.js';
import ExcelJS from 'exceljs';

const router = Router();

const INVOICE_CSV_FIELDS = [
  'Invoice Date', 'Invoice Number', 'Invoice Status', 'Invoice VAT Treatment', 'Customer Name', 'Due Date',
  'PurchaseOrder', 'Template Name', 'Currency Code', 'Exchange Rate', 'Item Name', 'SKU', 'Item Desc',
  'Quantity', 'Item Type', 'Item Price', 'Is Inclusive Tax', 'Discount(%)', 'Item Tax', 'Item Tax %',
  'Item Tax Type', 'Notes', "Terms & Conditions", 'PayPal', 'Authorize.Net', 'Google Checkout', 'Warehouse Name',
];

export const INVOICE_VAT_LABELS = { 'Standard 20%': 'Standard Rate', 'Reduced 5%': 'Reduced Rate', 'Zero 0%': 'Zero Rate', Exempt: 'Exempt' };

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
    const maps = { productById, stockById, packagingById, shippingById };

    const todayStr = new Date().toISOString().slice(0, 10);
    const rows = [];

    for (const order of dueOrders) {
      const invoiceNumber = order.invoice_number || (await nextInvoiceNumber(client));
      await client.query('UPDATE orders SET invoice_number = $1, ready_to_invoice = false WHERE id = $2', [invoiceNumber, order.id]);

      const { rows: items } = await client.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
      const cust = order.customer_id ? customerById.get(order.customer_id) : null;
      for (const line of invoiceLinesForOrder(items, maps)) {
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
            'Item Name': line.name,
            SKU: '',
            'Item Desc': '',
            Quantity: line.qty,
            'Item Type': 'goods',
            'Item Price': line.unitPriceIncVat.toFixed(2),
            'Is Inclusive Tax': 'TRUE',
            'Discount(%)': 0,
            'Item Tax': INVOICE_VAT_LABELS[line.rate] || line.rate,
            'Item Tax %': line.vatPct,
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

// Orders report (Excel). Filters, all optional: statuses[], users[] (anyone
// who created the order or changed its status), dateFrom/dateTo (order
// date, inclusive), customerId. Sheets: one row per order, one per hamper
// line, and the status history. Cost/profit columns are admin-only.
router.post('/orders', async (req, res) => {
  const f = req.body || {};
  const statuses = Array.isArray(f.statuses) ? f.statuses : [];
  const users = Array.isArray(f.users) ? f.users.map((u) => String(u).toLowerCase()) : [];
  const showCosts = !!(req.staff && req.staff.isAdmin);

  const [orders, products, stock, packaging, shipping, customers] = await Promise.all([
    listOrders(), listProducts(), listStock(), listPackaging(), listShipping(), listCustomers(),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const packagingById = new Map(packaging.map((p) => [p.id, p]));
  const shippingById = new Map(shipping.map((s) => [s.id, s]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const maps = { productById, stockById, packagingById, shippingById };

  const selected = orders.filter((o) => {
    if (statuses.length && !statuses.includes(o.status)) return false;
    if (f.customerId && o.customerId !== f.customerId) return false;
    if (f.dateFrom && (!o.orderDate || o.orderDate < f.dateFrom)) return false;
    if (f.dateTo && (!o.orderDate || o.orderDate > f.dateTo)) return false;
    if (users.length) {
      const involved = new Set([o.createdBy, ...o.statusHistory.map((h) => h.username)].filter(Boolean).map((u) => u.toLowerCase()));
      if (!users.some((u) => involved.has(u))) return false;
    }
    return true;
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hamper Helper';
  const money = '£#,##0.00';
  const addSheet = (name, columns) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map(([header, key, width, numFmt]) => ({ header, key, width: width || 14, style: numFmt ? { numFmt } : {} }));
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return ws;
  };

  const orderCols = [
    ['Order', 'id', 18], ['Customer', 'customer', 30], ['Main contact', 'contact', 20], ['Email', 'email', 26], ['Phone', 'phone', 16],
    ['Status', 'status', 12], ['Priority', 'priority', 10], ['Order date', 'orderDate', 12], ['Dispatch date', 'dispatchDate', 13],
    ['Hampers and items', 'hampers', 40], ['Total qty', 'qty', 9], ['Ribbon colour', 'ribbon', 14], ['Font colour', 'font', 14],
    ['Order notes', 'notes', 30], ['Customer notes', 'customerNotes', 30], ['Ready to invoice', 'readyToInvoice', 10], ['Invoice sent', 'invoiceSent', 10], ['Invoice number', 'invoiceNumber', 14],
    ['Created by', 'createdBy', 14], ['Last status change', 'lastChange', 20], ['Changed by', 'lastChangeBy', 14],
    ['Total ex VAT', 'exVat', 13, money], ['VAT', 'vat', 11, money], ['Total inc VAT', 'incVat', 13, money],
  ];
  if (showCosts) orderCols.push(['Cost (inc VAT)', 'cost', 13, money], ['Profit (ex VAT)', 'profit', 13, money]);
  const lineCols = [
    ['Order', 'id', 18], ['Customer', 'customer', 30], ['Status', 'status', 12], ['Order date', 'orderDate', 12],
    ['Hamper or item', 'hamper', 30], ['Qty', 'qty', 7], ['Packed', 'packed', 8], ['Shipped', 'shipped', 8],
    ['Price line', 'line', 16], ['Ex VAT', 'exVat', 12, money], ['VAT', 'vat', 11, money], ['Inc VAT', 'incVat', 12, money],
  ];
  const historyCols = [['Order', 'id', 18], ['Customer', 'customer', 30], ['From', 'from', 12], ['To', 'to', 12], ['User', 'user', 14], ['When', 'when', 20]];

  const wsOrders = addSheet('Orders', orderCols);
  const wsLines = addSheet('Order lines', lineCols);
  const wsHistory = addSheet('Status history', historyCols);
  const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : '');
  const pct = (rate) => (String(rate).toLowerCase().includes('exempt') ? 'Exempt' : Math.round(vatRatePercent(rate) * 100) + '%');

  for (const o of selected) {
    const cust = customerById.get(o.customerId);
    const custName = cust ? cust.companyName : '';
    let exVat = 0, incVat = 0, cost = 0, costExVat = 0, qty = 0;
    const hampers = [];
    for (const it of o.items) {
      const unit = computeOrderLineUnit(it, maps);
      qty += it.qty || 0;
      hampers.push(`${it.qty} × ${unit ? unit.name : it.stockId ? 'Unknown item' : 'Unknown hamper'}`);
      if (!unit) continue;
      const t = unit.totals;
      cost += t.cost * it.qty;
      costExVat += t.costExVat * it.qty;
      for (const v of t.vatBreakdown) {
        exVat += v.subtotal * it.qty;
        incVat += v.totalIncVat * it.qty;
        wsLines.addRow({
          id: o.id, customer: custName, status: o.status, orderDate: o.orderDate || '', hamper: unit.isItem ? `${unit.name} (item)` : unit.name,
          qty: it.qty, packed: it.qtyPacked, shipped: it.qtyShipped,
          line: v.isShipping ? `Shipping (${pct(v.rate)})` : pct(v.rate),
          exVat: round2(v.subtotal * it.qty), vat: round2(v.vatAmount * it.qty), incVat: round2(v.totalIncVat * it.qty),
        });
      }
    }
    const last = o.statusHistory[o.statusHistory.length - 1];
    const row = {
      id: o.id, customer: custName, contact: cust ? cust.contactName : '', email: cust ? cust.email : '', phone: cust ? cust.phonePrimary : '',
      status: o.status, priority: o.priority, orderDate: o.orderDate || '', dispatchDate: o.deliveryDate || '',
      hampers: hampers.join(', '), qty, ribbon: cust ? cust.ribbonColor : '', font: cust ? cust.fontColor : '',
      notes: o.notes, customerNotes: cust ? cust.notes : '', readyToInvoice: o.readyToInvoice ? 'Yes' : 'No', invoiceSent: o.invoiceSent ? 'Yes' : 'No', invoiceNumber: o.invoiceNumber || '',
      createdBy: o.createdBy, lastChange: last ? fmtWhen(last.changedAt) : '', lastChangeBy: last ? last.username : '',
      exVat: round2(exVat), vat: round2(incVat - exVat), incVat: round2(incVat),
    };
    if (showCosts) Object.assign(row, { cost: round2(cost), profit: round2(exVat - costExVat) });
    wsOrders.addRow(row);
    for (const h of o.statusHistory) {
      wsHistory.addRow({ id: o.id, customer: custName, from: h.fromStatus || '(created)', to: h.toStatus, user: h.username, when: fmtWhen(h.changedAt) });
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="orders-${todayStr}.xlsx"`);
  res.setHeader('X-Order-Count', String(selected.length));
  await wb.xlsx.write(res);
  res.end();
});

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

export default router;

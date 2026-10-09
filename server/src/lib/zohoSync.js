// Every few minutes, look up the Zoho invoices still drafts as far as we
// know. Once one has been sent (marked sent, emailed, paid...), tick Invoice
// sent on its order and untick Ready to invoice.
import { pool } from '../db.js';
import { getConnection, zohoBooks } from './zoho.js';

const NOT_SENT = new Set(['draft', 'pending_approval', 'approved', 'rejected']);
const EVERY_MS = 5 * 60 * 1000;
let running = null;

async function run() {
  const conn = await getConnection();
  if (!conn) return { checked: 0, updated: [] };
  const { rows } = await pool.query(
    "SELECT id, zoho_invoice_id FROM orders WHERE zoho_invoice_id IS NOT NULL AND COALESCE(zoho_invoice_status, 'draft') IN ('draft', 'pending_approval', 'approved', 'rejected') ORDER BY id"
  );
  const updated = [];
  for (const order of rows) {
    let status;
    try {
      status = String((await zohoBooks(conn, 'GET', `/invoices/${encodeURIComponent(order.zoho_invoice_id)}`)).invoice.status || '').toLowerCase();
    } catch (err) {
      // Deleted in Zoho: unlink it, so the order can be invoiced again.
      if (/does not exist|not found/i.test(err.message)) {
        await pool.query(
          `UPDATE orders SET invoice_number = CASE WHEN invoice_number = zoho_invoice_number THEN NULL ELSE invoice_number END,
             zoho_invoice_id = NULL, zoho_invoice_number = NULL, zoho_invoice_status = NULL WHERE id = $1`,
          [order.id]
        );
      } else console.error(`Zoho invoice check for ${order.id}: ${err.message}`);
      continue;
    }
    if (!status || NOT_SENT.has(status)) {
      await pool.query('UPDATE orders SET zoho_invoice_status = $1 WHERE id = $2 AND zoho_invoice_status IS DISTINCT FROM $1', [status || 'draft', order.id]);
      continue;
    }
    const sent = status !== 'void';
    await pool.query(
      sent ? 'UPDATE orders SET zoho_invoice_status = $1, invoice_sent = true, ready_to_invoice = false WHERE id = $2'
        : 'UPDATE orders SET zoho_invoice_status = $1 WHERE id = $2',
      [status, order.id]
    );
    if (sent) updated.push(order.id);
  }
  return { checked: rows.length, updated };
}

// One check at a time; a second caller waits for the one in progress.
export function syncSentInvoices() {
  if (!running) running = run().finally(() => { running = null; });
  return running;
}

export function startZohoSentSync() {
  const tick = () => syncSentInvoices().catch((err) => console.error('Zoho sent-invoice check failed:', err.message));
  setTimeout(tick, 30 * 1000);
  setInterval(tick, EVERY_MS).unref();
}

import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { orderToApi } from '../lib/mappers.js';
import { listStock } from './stock.js';

const router = Router();

const ORDER_FLOW = ['Proposal', 'Confirmed', 'Packing', 'Packed', 'Shipped', 'Closed'];
const PRIORITIES = ['High', 'Medium', 'Low'];

function priorityFromBody(body) {
  return PRIORITIES.includes(body.priority) ? body.priority : 'Medium';
}

function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r[key])) map.set(r[key], []);
    map.get(r[key]).push(r);
  }
  return map;
}

async function listOrders() {
  const { rows: orders } = await pool.query('SELECT * FROM orders ORDER BY order_date ASC NULLS LAST, id ASC');
  const { rows: items } = await pool.query('SELECT * FROM order_items ORDER BY id ASC');
  const { rows: history } = await pool.query('SELECT * FROM order_status_history ORDER BY changed_at ASC, id ASC');
  const itemsByOrder = groupBy(items, 'order_id');
  const historyByOrder = groupBy(history, 'order_id');
  return orders.map((o) => orderToApi(o, itemsByOrder.get(o.id) || [], historyByOrder.get(o.id) || []));
}

async function recordStatus(client, orderId, fromStatus, toStatus, staff) {
  await client.query(
    'INSERT INTO order_status_history (order_id, from_status, to_status, staff_id, username) VALUES ($1,$2,$3,$4,$5)',
    [orderId, fromStatus, toStatus, staff ? staff.id : null, staff ? staff.username : null]
  );
}

// A line is either a hamper (productId) or a single item (stockId).
async function saveItems(client, orderId, items) {
  await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
  for (const it of items || []) {
    const isItem = it.kind === 'item';
    const productId = isItem ? null : it.productId || null;
    const stockId = isItem ? it.stockId || null : null;
    if (!productId && !stockId) continue;
    await client.query(
      'INSERT INTO order_items (order_id, product_id, stock_id, qty, qty_packed, qty_shipped) VALUES ($1,$2,$3,$4,$5,$6)',
      [orderId, productId, stockId, Number(it.qty) || 0, Number(it.qtyPacked) || 0, Number(it.qtyShipped) || 0]
    );
  }
}

// Ticking "Invoice sent" takes the order off the ready-to-invoice list.
function invoiceFlags(body) {
  const invoiceSent = !!body.invoiceSent;
  return { invoiceSent, readyToInvoice: invoiceSent ? false : !!body.readyToInvoice };
}

router.get('/', async (req, res) => {
  res.json(await listOrders());
});

router.post('/', async (req, res) => {
  if (!req.body.items || !req.body.items.length) return res.status(400).json({ error: 'Add at least one hamper or item' });
  const id = uid('ord');
  const flags = invoiceFlags(req.body);
  const status = ORDER_FLOW.includes(req.body.status) ? req.body.status : 'Proposal';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO orders (id, customer_id, order_date, delivery_date, status, notes, ready_to_invoice, stock_deducted, priority, created_by, invoice_sent, proposal_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11)`,
      [id, req.body.customerId || null, req.body.orderDate || null, req.body.deliveryDate || null, status, req.body.notes || '', flags.readyToInvoice, priorityFromBody(req.body), req.staff ? req.staff.username : null, flags.invoiceSent, req.body.proposalId || null]
    );
    // An order made from a proposal marks that proposal Accepted.
    if (req.body.proposalId) await client.query("UPDATE proposals SET status = 'Accepted' WHERE id = $1", [req.body.proposalId]);
    await recordStatus(client, id, null, status, req.staff);
    await saveItems(client, id, req.body.items);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json(await listOrders());
});

// Saves the Production page's drag-and-drop order: body.orders is the list
// top to bottom, each { id, priority } (dragging into another priority group
// changes the order's priority to match).
router.put('/production-order', async (req, res) => {
  const list = Array.isArray(req.body.orders) ? req.body.orders : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o || !o.id) continue;
      await client.query('UPDATE orders SET production_rank = $1, priority = $2 WHERE id = $3', [i, priorityFromBody(o), o.id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await listOrders());
});

router.put('/:id', async (req, res) => {
  if (!req.body.items || !req.body.items.length) return res.status(400).json({ error: 'Add at least one hamper or item' });
  const flags = invoiceFlags(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE orders SET customer_id=$1, order_date=$2, delivery_date=$3, notes=$4, ready_to_invoice=$5, priority=$6, invoice_sent=$7 WHERE id=$8`,
      [req.body.customerId || null, req.body.orderDate || null, req.body.deliveryDate || null, req.body.notes || '', flags.readyToInvoice, priorityFromBody(req.body), flags.invoiceSent, req.params.id]
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    await saveItems(client, req.params.id, req.body.items);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await listOrders());
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
  res.json(await listOrders());
});

// Advance/regress an order through the fulfilment flow, deducting or
// restoring stock exactly once (tracked via stock_deducted) the same way the
// original client-only app did, but now inside one DB transaction instead of
// a read-modify-write against local state.
router.post('/:id/move', async (req, res) => {
  const direction = req.body.direction === -1 ? -1 : req.body.direction === 1 ? 1 : null;
  if (direction === null) return res.status(400).json({ error: 'direction must be 1 or -1' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    const order = orderRows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const { rows: items } = await client.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);

    const idx = ORDER_FLOW.indexOf(order.status);
    const newIdx = idx + direction;
    if (idx < 0 || newIdx < 0 || newIdx >= ORDER_FLOW.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order cannot move further in that direction' });
    }
    const newStatus = ORDER_FLOW[newIdx];
    const packedIdx = ORDER_FLOW.indexOf('Packed');

    // Things that should be done before this move. The person can cancel,
    // move anyway (override 'force'), or have the order filled in to match
    // and then move (override 'fix').
    const blockers = [];
    if (direction > 0 && newStatus === 'Packed') {
      const short = items.filter((it) => (it.qty_packed || 0) < (it.qty || 0));
      if (short.length) blockers.push({ code: 'packed', message: `${short.length} line${short.length === 1 ? ' is' : 's are'} not fully marked as packed`, fix: 'Mark everything as packed' });
    }
    if (direction > 0 && newStatus === 'Closed') {
      const short = items.filter((it) => (it.qty_shipped || 0) < (it.qty || 0));
      if (short.length) blockers.push({ code: 'shipped', message: `${short.length} line${short.length === 1 ? ' is' : 's are'} not fully marked as shipped`, fix: 'Mark everything as shipped' });
      if (!order.invoice_sent) blockers.push({ code: 'invoice', message: 'The invoice is not marked as sent', fix: 'Tick Invoice sent' });
    }
    const override = req.body.override;
    if (blockers.length && override !== 'force' && override !== 'fix') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: blockers.map((b) => b.message).join('; '), blockers });
    }
    if (blockers.length && override === 'fix') {
      for (const b of blockers) {
        if (b.code === 'packed') await client.query('UPDATE order_items SET qty_packed = qty WHERE order_id = $1', [req.params.id]);
        if (b.code === 'shipped') await client.query('UPDATE order_items SET qty_shipped = qty WHERE order_id = $1', [req.params.id]);
        if (b.code === 'invoice') await client.query('UPDATE orders SET invoice_sent = true, ready_to_invoice = false WHERE id = $1', [req.params.id]);
      }
    }

    // productId -> componentId -> qty per unit, for every item on this order
    const productIds = [...new Set(items.map((it) => it.product_id).filter(Boolean))];
    let componentsByProduct = new Map();
    if (productIds.length) {
      const { rows: comps } = await client.query('SELECT * FROM product_components WHERE product_id = ANY($1)', [productIds]);
      for (const c of comps) {
        if (!componentsByProduct.has(c.product_id)) componentsByProduct.set(c.product_id, []);
        componentsByProduct.get(c.product_id).push(c);
      }
    }

    async function adjustStock(sign) {
      const deltas = new Map(); // componentId -> qty delta
      for (const it of items) {
        if (it.stock_id) {
          deltas.set(it.stock_id, (deltas.get(it.stock_id) || 0) + sign * (it.qty || 0));
          continue;
        }
        const comps = componentsByProduct.get(it.product_id) || [];
        for (const c of comps) {
          const delta = sign * (c.qty || 0) * it.qty;
          deltas.set(c.component_id, (deltas.get(c.component_id) || 0) + delta);
        }
      }
      for (const [componentId, delta] of deltas) {
        await client.query('UPDATE stock_items SET qty_on_hand = GREATEST(0, qty_on_hand - $1) WHERE id = $2', [delta, componentId]);
      }
    }

    if (direction > 0 && newStatus === 'Packed' && !order.stock_deducted) {
      await adjustStock(1);
      await client.query('UPDATE orders SET stock_deducted = true WHERE id = $1', [req.params.id]);
    } else if (direction < 0 && order.stock_deducted && newIdx < packedIdx) {
      await adjustStock(-1);
      await client.query('UPDATE orders SET stock_deducted = false WHERE id = $1', [req.params.id]);
    }

    await client.query('UPDATE orders SET status = $1 WHERE id = $2', [newStatus, req.params.id]);
    await recordStatus(client, req.params.id, order.status, newStatus, req.staff);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ orders: await listOrders(), stock: await listStock() });
});

export default router;
export { listOrders, ORDER_FLOW };

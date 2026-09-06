import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { stockToApi } from '../lib/mappers.js';

const router = Router();

async function listStock() {
  const { rows } = await pool.query('SELECT * FROM stock_items ORDER BY item_name ASC');
  return rows.map(stockToApi);
}

function fromBody(body) {
  return {
    brand: (body.brand || '').trim(),
    category: (body.category || '').trim(),
    item_name: (body.itemName || '').trim(),
    is_veg: !!body.v,
    is_vegan: !!body.vg,
    is_gluten_free: !!body.g,
    contains_nuts: !!body.n,
    cost: Number(body.cost) || 0,
    price: Number(body.price) || 0,
    weight: body.weight === '' || body.weight == null ? null : Number(body.weight),
    vat: body.vat || 'Standard 20%',
    availability: body.availability || 'In stock',
    qty_on_hand: Number(body.qtyOnHand) || 0,
    qty_on_order: Number(body.qtyOnOrder) || 0,
  };
}

router.get('/', async (req, res) => {
  res.json(await listStock());
});

router.post('/', async (req, res) => {
  if (!req.body.itemName || !req.body.itemName.trim()) {
    return res.status(400).json({ error: 'itemName is required' });
  }
  const id = uid('stk');
  const f = fromBody(req.body);
  await pool.query(
    `INSERT INTO stock_items (id, brand, item_name, category, is_veg, is_vegan, is_gluten_free, contains_nuts, cost, price, weight, vat, availability, qty_on_hand, qty_on_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, f.brand, f.item_name, f.category, f.is_veg, f.is_vegan, f.is_gluten_free, f.contains_nuts, f.cost, f.price, f.weight, f.vat, f.availability, f.qty_on_hand, f.qty_on_order]
  );
  res.status(201).json(await listStock());
});

router.put('/:id', async (req, res) => {
  if (!req.body.itemName || !req.body.itemName.trim()) {
    return res.status(400).json({ error: 'itemName is required' });
  }
  const f = fromBody(req.body);
  const { rowCount } = await pool.query(
    `UPDATE stock_items SET brand=$1, item_name=$2, category=$3, is_veg=$4, is_vegan=$5, is_gluten_free=$6, contains_nuts=$7, cost=$8, price=$9, weight=$10, vat=$11, availability=$12, qty_on_hand=$13, qty_on_order=$14
     WHERE id=$15`,
    [f.brand, f.item_name, f.category, f.is_veg, f.is_vegan, f.is_gluten_free, f.contains_nuts, f.cost, f.price, f.weight, f.vat, f.availability, f.qty_on_hand, f.qty_on_order, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Item not found' });
  res.json(await listStock());
});

router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // A hamper recipe line referencing this item no longer makes sense once
    // the item itself is gone, so drop the line rather than leave a dangling FK.
    await client.query('DELETE FROM product_components WHERE component_id = $1', [req.params.id]);
    await client.query('DELETE FROM stock_items WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await listStock());
});

function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = (v || '').toString().trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

// Bulk upsert from a parsed CSV (rows keyed the same way the CSV export uses).
router.post('/import', async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  let added = 0;
  let updated = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const name = (row.itemName || row.name || '').toString().trim();
      if (!name) continue;
      const f = fromBody({ ...row, itemName: name, v: toBool(row.v), vg: toBool(row.vg), g: toBool(row.g), n: toBool(row.n) });
      let id = row.id;
      let existing = null;
      if (id) {
        const { rows: found } = await client.query('SELECT id FROM stock_items WHERE id = $1', [id]);
        existing = found[0] || null;
      }
      if (existing) {
        await client.query(
          `UPDATE stock_items SET brand=$1, item_name=$2, category=$3, is_veg=$4, is_vegan=$5, is_gluten_free=$6, contains_nuts=$7, cost=$8, price=$9, weight=$10, vat=$11, availability=$12, qty_on_hand=$13, qty_on_order=$14
           WHERE id=$15`,
          [f.brand, f.item_name, f.category, f.is_veg, f.is_vegan, f.is_gluten_free, f.contains_nuts, f.cost, f.price, f.weight, f.vat, f.availability, f.qty_on_hand, f.qty_on_order, id]
        );
        updated++;
      } else {
        id = uid('stk');
        await client.query(
          `INSERT INTO stock_items (id, brand, item_name, category, is_veg, is_vegan, is_gluten_free, contains_nuts, cost, price, weight, vat, availability, qty_on_hand, qty_on_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [id, f.brand, f.item_name, f.category, f.is_veg, f.is_vegan, f.is_gluten_free, f.contains_nuts, f.cost, f.price, f.weight, f.vat, f.availability, f.qty_on_hand, f.qty_on_order]
        );
        added++;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ added, updated, stock: await listStock() });
});

export default router;
export { listStock };

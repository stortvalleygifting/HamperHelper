import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { shippingToApi } from '../lib/mappers.js';

const router = Router();

async function list() {
  const { rows } = await pool.query('SELECT * FROM shipping_options ORDER BY label ASC');
  return rows.map(shippingToApi);
}

function fromBody(body) {
  return {
    label: (body.label || '').trim(),
    price: Number(body.price) || 0,
    // undefined = not sent (non-admin staff never see or send costs), so
    // leave whatever is stored; '' or null = explicitly cleared.
    cost: body.cost === undefined ? undefined : body.cost === '' || body.cost == null ? null : Number(body.cost),
    vat: body.vat || 'Standard 20%',
  };
}

router.get('/', async (req, res) => {
  res.json(await list());
});

router.post('/', async (req, res) => {
  if (!req.body.label || !req.body.label.trim()) return res.status(400).json({ error: 'label is required' });
  const id = uid('shp');
  const f = fromBody(req.body);
  await pool.query('INSERT INTO shipping_options (id, label, price, cost, vat) VALUES ($1,$2,$3,$4,$5)', [id, f.label, f.price, f.cost ?? null, f.vat]);
  res.status(201).json(await list());
});

router.put('/:id', async (req, res) => {
  if (!req.body.label || !req.body.label.trim()) return res.status(400).json({ error: 'label is required' });
  const f = fromBody(req.body);
  const { rowCount } = await pool.query(
    'UPDATE shipping_options SET label=$1, price=$2, vat=$3, cost=CASE WHEN $4::boolean THEN $5::numeric ELSE cost END WHERE id=$6',
    [f.label, f.price, f.vat, f.cost !== undefined, f.cost ?? null, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Shipping option not found' });
  res.json(await list());
});

router.delete('/:id', async (req, res) => {
  await pool.query('UPDATE products SET shipping_id = NULL WHERE shipping_id = $1', [req.params.id]);
  await pool.query('DELETE FROM shipping_options WHERE id = $1', [req.params.id]);
  res.json(await list());
});

export default router;
export { list as listShipping };

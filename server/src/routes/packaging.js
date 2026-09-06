import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { packagingToApi } from '../lib/mappers.js';

const router = Router();

async function list() {
  const { rows } = await pool.query('SELECT * FROM packaging_options ORDER BY size ASC');
  return rows.map(packagingToApi);
}

function fromBody(body) {
  return {
    size: (body.size || '').trim(),
    price: Number(body.price) || 0,
    weight: body.weight === '' || body.weight == null ? null : Number(body.weight),
    cost: body.cost === '' || body.cost == null ? null : Number(body.cost),
    vat: body.vat || 'Standard 20%',
  };
}

router.get('/', async (req, res) => {
  res.json(await list());
});

router.post('/', async (req, res) => {
  if (!req.body.size || !req.body.size.trim()) return res.status(400).json({ error: 'size is required' });
  const id = uid('pkg');
  const f = fromBody(req.body);
  await pool.query('INSERT INTO packaging_options (id, size, price, weight, cost, vat) VALUES ($1,$2,$3,$4,$5,$6)', [id, f.size, f.price, f.weight, f.cost, f.vat]);
  res.status(201).json(await list());
});

router.put('/:id', async (req, res) => {
  if (!req.body.size || !req.body.size.trim()) return res.status(400).json({ error: 'size is required' });
  const f = fromBody(req.body);
  const { rowCount } = await pool.query('UPDATE packaging_options SET size=$1, price=$2, weight=$3, cost=$4, vat=$5 WHERE id=$6', [f.size, f.price, f.weight, f.cost, f.vat, req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Packaging option not found' });
  res.json(await list());
});

router.delete('/:id', async (req, res) => {
  await pool.query('UPDATE products SET packaging_id = NULL WHERE packaging_id = $1', [req.params.id]);
  await pool.query('DELETE FROM packaging_options WHERE id = $1', [req.params.id]);
  res.json(await list());
});

export default router;
export { list as listPackaging };

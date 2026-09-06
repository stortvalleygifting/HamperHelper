import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { sourceToApi } from '../lib/mappers.js';

const router = Router();

async function list() {
  const { rows } = await pool.query('SELECT * FROM sources ORDER BY label ASC');
  return rows.map(sourceToApi);
}

router.get('/', async (req, res) => {
  res.json(await list());
});

router.post('/', async (req, res) => {
  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ error: 'label is required' });
  const id = uid('src');
  await pool.query('INSERT INTO sources (id, label) VALUES ($1,$2)', [id, label]);
  res.status(201).json(await list());
});

router.put('/:id', async (req, res) => {
  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ error: 'label is required' });
  const { rowCount } = await pool.query('UPDATE sources SET label=$1 WHERE id=$2', [label, req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Source not found' });
  res.json(await list());
});

router.delete('/:id', async (req, res) => {
  await pool.query('UPDATE customers SET source_id = NULL WHERE source_id = $1', [req.params.id]);
  await pool.query('DELETE FROM sources WHERE id = $1', [req.params.id]);
  res.json(await list());
});

export default router;
export { list as listSources };

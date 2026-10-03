import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { colourToApi } from '../lib/mappers.js';

const router = Router();

async function list() {
  const { rows } = await pool.query('SELECT * FROM colours ORDER BY lower(name) ASC');
  return rows.map(colourToApi);
}

function fields(body) {
  return {
    name: (body.name || '').trim(),
    hex: (body.hex || '').trim(),
    rgb: (body.rgb || '').trim(),
    pantone: (body.pantone || '').trim(),
  };
}

router.get('/', async (req, res) => {
  res.json(await list());
});

router.post('/', async (req, res) => {
  const f = fields(req.body);
  if (!f.name) return res.status(400).json({ error: 'Give the colour a name' });
  await pool.query('INSERT INTO colours (id, name, hex, rgb, pantone) VALUES ($1,$2,$3,$4,$5)', [uid('col'), f.name, f.hex, f.rgb, f.pantone]);
  res.status(201).json(await list());
});

router.put('/:id', async (req, res) => {
  const f = fields(req.body);
  if (!f.name) return res.status(400).json({ error: 'Give the colour a name' });
  const { rowCount } = await pool.query('UPDATE colours SET name=$1, hex=$2, rgb=$3, pantone=$4 WHERE id=$5', [f.name, f.hex, f.rgb, f.pantone, req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Colour not found' });
  res.json(await list());
});

// Customers store the colour's name as text, so deleting a colour leaves
// their ribbon colour as typed text rather than losing it.
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM colours WHERE id = $1', [req.params.id]);
  res.json(await list());
});

export default router;
export { list as listColours };

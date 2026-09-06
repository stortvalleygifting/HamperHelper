import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { hashPassword } from '../lib/passwords.js';
import { staffToApi } from '../lib/mappers.js';

const router = Router();

async function list() {
  const { rows } = await pool.query('SELECT * FROM staff ORDER BY username ASC');
  return rows.map(staffToApi);
}

function isUniqueViolation(err) {
  return err && err.code === '23505';
}

router.get('/', async (req, res) => {
  res.json(await list());
});

router.post('/', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  if (!username) return res.status(400).json({ error: 'username is required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const id = uid('stf');
  try {
    await pool.query(
      'INSERT INTO staff (id, username, password_hash, display_name, is_admin) VALUES ($1,$2,$3,$4,$5)',
      [id, username, hashPassword(password), (req.body.displayName || '').trim(), !!req.body.isAdmin]
    );
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: 'That username is already taken' });
    throw err;
  }
  res.status(201).json(await list());
});

router.put('/:id', async (req, res) => {
  const username = (req.body.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username is required' });
  if (req.body.password && req.body.password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Never let the last admin demote themselves (or be demoted) — that would
  // lock everyone out of staff management.
  if (req.body.isAdmin === false) {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM staff WHERE is_admin = true AND id != $1', [req.params.id]);
    const { rows: current } = await pool.query('SELECT is_admin FROM staff WHERE id = $1', [req.params.id]);
    if (current[0] && current[0].is_admin && rows[0].n === 0) {
      return res.status(400).json({ error: 'At least one admin account must remain' });
    }
  }

  const fields = ['username = $1', 'display_name = $2', 'is_admin = $3'];
  const values = [username, (req.body.displayName || '').trim(), !!req.body.isAdmin];
  if (req.body.password) {
    fields.push(`password_hash = $${values.length + 1}`);
    values.push(hashPassword(req.body.password));
  }
  values.push(req.params.id);

  try {
    const { rowCount } = await pool.query(`UPDATE staff SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
    if (!rowCount) return res.status(404).json({ error: 'Staff member not found' });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: 'That username is already taken' });
    throw err;
  }
  res.json(await list());
});

router.delete('/:id', async (req, res) => {
  if (req.session.staffId === req.params.id) {
    return res.status(400).json({ error: "You can't delete your own account while logged in" });
  }
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM staff');
  if (rows[0].n <= 1) {
    return res.status(400).json({ error: 'At least one staff account must remain' });
  }
  await pool.query('DELETE FROM staff WHERE id = $1', [req.params.id]);
  res.json(await list());
});

export default router;

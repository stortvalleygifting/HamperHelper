import { Router } from 'express';
import { pool } from '../db.js';
import { verifyPassword } from '../lib/passwords.js';
import { staffToApi } from '../lib/mappers.js';

const router = Router();

router.post('/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const { rows } = await pool.query('SELECT * FROM staff WHERE username = $1', [username]);
  const staff = rows[0];
  if (!staff || !verifyPassword(password, staff.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start session' });
    req.session.staffId = staff.id;
    res.json(staffToApi(staff));
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(204).end();
  });
});

router.get('/session', async (req, res) => {
  if (!req.session || !req.session.staffId) return res.json(null);
  const { rows } = await pool.query('SELECT * FROM staff WHERE id = $1', [req.session.staffId]);
  if (!rows[0]) return res.json(null);
  res.json(staffToApi(rows[0]));
});

export default router;

import { pool } from '../db.js';

// Loads the logged-in staff member onto req.staff. Runs after requireAuth on
// every API route, so a deleted account (or one demoted from admin) takes
// effect on the very next request rather than when the session expires.
export async function loadStaff(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT id, is_admin FROM staff WHERE id = $1', [req.session.staffId]);
    if (!rows[0]) return res.status(401).json({ error: 'Not logged in' });
    req.staff = { id: rows[0].id, isAdmin: rows[0].is_admin };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (!req.staff || !req.staff.isAdmin) return res.status(403).json({ error: 'Only admins can do that' });
  next();
}

// Removes every `cost` key, at any depth. Cost figures (stock, packaging,
// shipping) are admin-only: non-admins never receive them, and any they send
// are ignored so a save from their screen leaves the stored cost untouched.
function stripCosts(value) {
  if (Array.isArray(value)) {
    value.forEach(stripCosts);
  } else if (value && typeof value === 'object') {
    delete value.cost;
    Object.values(value).forEach(stripCosts);
  }
  return value;
}

export function hideCostsFromNonAdmins(req, res, next) {
  if (req.staff && req.staff.isAdmin) return next();
  stripCosts(req.body);
  const json = res.json.bind(res);
  res.json = (body) => json(stripCosts(body));
  next();
}

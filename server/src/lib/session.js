import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../db.js';

const PgSession = connectPgSimple(session);

const IDLE_LIMIT_MS = 3 * 60 * 60 * 1000;

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required');
}

export const sessionMiddleware = session({
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // Every response pushes the cookie's expiry back, so a closed browser is
  // logged out IDLE_LIMIT_MS after its last request. An open tab's automatic
  // refreshes also keep the cookie alive, so idleness itself is judged by
  // lastActive below.
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: IDLE_LIMIT_MS,
  },
});

// Log out after 3 hours without anyone using the screen. The page's own
// background refreshes send X-Background-Refresh and don't count as use.
export function isIdleExpired(req) {
  const last = req.session && req.session.lastActive;
  return !!last && Date.now() - last > IDLE_LIMIT_MS;
}

export function requireAuth(req, res, next) {
  if (!req.session || !req.session.staffId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  if (isIdleExpired(req)) {
    return req.session.destroy(() => res.status(401).json({ error: 'Not logged in' }));
  }
  if (req.get('X-Background-Refresh') !== '1') req.session.lastActive = Date.now();
  next();
}

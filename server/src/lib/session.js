import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../db.js';

const PgSession = connectPgSimple(session);

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required');
}

export const sessionMiddleware = session({
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

export function requireAuth(req, res, next) {
  if (!req.session || !req.session.staffId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

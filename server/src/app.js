import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPLOADS_ROOT } from './lib/storage.js';
import { sessionMiddleware, requireAuth } from './lib/session.js';

import authRouter from './routes/auth.js';
import staffRouter from './routes/staff.js';
import bootstrapRouter from './routes/bootstrap.js';
import stockRouter from './routes/stock.js';
import packagingRouter from './routes/packaging.js';
import shippingRouter from './routes/shipping.js';
import sourcesRouter from './routes/sources.js';
import customersRouter from './routes/customers.js';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import proposalsRouter from './routes/proposals.js';
import uploadsRouter from './routes/uploads.js';
import reportsRouter from './routes/reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../../public');
const assetsDir = path.resolve(__dirname, '../assets');

export function createApp() {
  const app = express();
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(sessionMiddleware);

  // Login/logout/session-check are the only API routes reachable while
  // signed out; everything else (including uploaded files) requires a
  // session.
  app.use('/api', authRouter);

  app.use('/uploads', requireAuth, express.static(UPLOADS_ROOT));
  app.use('/assets', requireAuth, express.static(assetsDir));

  app.use('/api/staff', requireAuth, staffRouter);
  app.use('/api/bootstrap', requireAuth, bootstrapRouter);
  app.use('/api/stock', requireAuth, stockRouter);
  app.use('/api/packaging', requireAuth, packagingRouter);
  app.use('/api/shipping', requireAuth, shippingRouter);
  app.use('/api/sources', requireAuth, sourcesRouter);
  app.use('/api/customers', requireAuth, customersRouter);
  app.use('/api/products', requireAuth, productsRouter);
  app.use('/api/orders', requireAuth, ordersRouter);
  app.use('/api/proposals', requireAuth, proposalsRouter);
  app.use('/api/uploads', requireAuth, uploadsRouter);
  app.use('/api/reports', requireAuth, reportsRouter);

  app.use(express.static(publicDir));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

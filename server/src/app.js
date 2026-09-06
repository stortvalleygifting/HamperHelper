import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPLOADS_ROOT } from './lib/storage.js';

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
  app.use(express.json({ limit: '2mb' }));

  app.use('/uploads', express.static(UPLOADS_ROOT));
  app.use('/assets', express.static(assetsDir));

  app.use('/api/bootstrap', bootstrapRouter);
  app.use('/api/stock', stockRouter);
  app.use('/api/packaging', packagingRouter);
  app.use('/api/shipping', shippingRouter);
  app.use('/api/sources', sourcesRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/proposals', proposalsRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/reports', reportsRouter);

  app.use(express.static(publicDir));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

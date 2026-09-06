import { Router } from 'express';
import { listStock } from './stock.js';
import { listPackaging } from './packaging.js';
import { listShipping } from './shipping.js';
import { listSources } from './sources.js';
import { listCustomers } from './customers.js';
import { listProducts } from './products.js';
import { listOrders } from './orders.js';
import { listProposals } from './proposals.js';

const router = Router();

router.get('/', async (req, res) => {
  const [stock, packaging, shipping, sources, customers, products, orders, proposals] = await Promise.all([
    listStock(), listPackaging(), listShipping(), listSources(), listCustomers(), listProducts(), listOrders(), listProposals(),
  ]);
  res.json({ stock, packaging, shipping, sources, customers, products, orders, proposals });
});

export default router;

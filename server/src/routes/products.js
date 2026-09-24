import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { productToApi } from '../lib/mappers.js';

const router = Router();

async function listProducts() {
  const { rows: products } = await pool.query('SELECT * FROM products ORDER BY name ASC');
  const { rows: components } = await pool.query('SELECT * FROM product_components ORDER BY id ASC');
  const byProduct = new Map();
  for (const c of components) {
    if (!byProduct.has(c.product_id)) byProduct.set(c.product_id, []);
    byProduct.get(c.product_id).push(c);
  }
  return products.map((p) => productToApi(p, byProduct.get(p.id) || []));
}

function photoUrlsFromBody(body) {
  const urls = Array.isArray(body.photoUrls) ? body.photoUrls : body.photoUrl ? [body.photoUrl] : [];
  return urls.filter((u) => typeof u === 'string' && u);
}

// Keep only rate -> finite, non-negative amount entries.
function priceOverridesFromBody(body) {
  const out = {};
  const raw = body.priceOverrides && typeof body.priceOverrides === 'object' ? body.priceOverrides : {};
  for (const [rate, amount] of Object.entries(raw)) {
    const n = Number(amount);
    if (amount !== null && amount !== '' && Number.isFinite(n) && n >= 0) out[rate] = Math.round(n * 100) / 100;
  }
  return out;
}

async function saveComponents(client, productId, components) {
  await client.query('DELETE FROM product_components WHERE product_id = $1', [productId]);
  for (const c of components || []) {
    if (!c.componentId) continue;
    await client.query(
      'INSERT INTO product_components (product_id, component_id, qty, price) VALUES ($1,$2,$3,$4)',
      [productId, c.componentId, Number(c.qty) || 0, c.price == null ? null : Number(c.price)]
    );
  }
}

router.get('/', async (req, res) => {
  res.json(await listProducts());
});

router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = uid('prd');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const photoUrls = photoUrlsFromBody(req.body);
    await client.query(
      'INSERT INTO products (id, name, packaging_id, shipping_id, photo_url, photo_urls, price_overrides) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, name, req.body.packagingId || null, req.body.shippingId || null, photoUrls[0] || '', JSON.stringify(photoUrls), JSON.stringify(priceOverridesFromBody(req.body))]
    );
    await saveComponents(client, id, req.body.components);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json(await listProducts());
});

router.put('/:id', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const photoUrls = photoUrlsFromBody(req.body);
    const { rowCount } = await client.query(
      'UPDATE products SET name=$1, packaging_id=$2, shipping_id=$3, photo_url=$4, photo_urls=$5, price_overrides=$6 WHERE id=$7',
      [name, req.body.packagingId || null, req.body.shippingId || null, photoUrls[0] || '', JSON.stringify(photoUrls), JSON.stringify(priceOverridesFromBody(req.body)), req.params.id]
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Hamper not found' });
    }
    await saveComponents(client, req.params.id, req.body.components);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await listProducts());
});

router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE order_items SET product_id = NULL WHERE product_id = $1', [req.params.id]);
    await client.query('UPDATE proposal_hampers SET product_id = NULL WHERE product_id = $1', [req.params.id]);
    await client.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await listProducts());
});

export default router;
export { listProducts };

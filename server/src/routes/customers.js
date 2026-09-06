import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { customerToApi } from '../lib/mappers.js';

const router = Router();

async function list() {
  const { rows } = await pool.query('SELECT * FROM customers ORDER BY company_name ASC');
  return rows.map(customerToApi);
}

function fromBody(body) {
  return {
    company_name: (body.companyName || '').trim(),
    source_id: body.sourceId || null,
    contact_name: (body.contactName || '').trim(),
    email: (body.email || '').trim(),
    phone_primary: (body.phonePrimary || '').trim(),
    phone_secondary: (body.phoneSecondary || '').trim(),
    contact_name2: (body.contactName2 || '').trim(),
    email2: (body.email2 || '').trim(),
    phone2_primary: (body.phone2Primary || '').trim(),
    phone2_secondary: (body.phone2Secondary || '').trim(),
    ribbon_color: (body.ribbonColor || '').trim(),
    font_color: (body.fontColor || '').trim(),
    logo_url: body.logoUrl || '',
    notes: (body.notes || '').trim(),
  };
}

router.get('/', async (req, res) => {
  res.json(await list());
});

router.post('/', async (req, res) => {
  if (!req.body.companyName || !req.body.companyName.trim()) return res.status(400).json({ error: 'companyName is required' });
  const id = uid('cus');
  const f = fromBody(req.body);
  await pool.query(
    `INSERT INTO customers (id, company_name, source_id, contact_name, email, phone_primary, phone_secondary, contact_name2, email2, phone2_primary, phone2_secondary, ribbon_color, font_color, logo_url, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, f.company_name, f.source_id, f.contact_name, f.email, f.phone_primary, f.phone_secondary, f.contact_name2, f.email2, f.phone2_primary, f.phone2_secondary, f.ribbon_color, f.font_color, f.logo_url, f.notes]
  );
  res.status(201).json({ id, customers: await list() });
});

router.put('/:id', async (req, res) => {
  if (!req.body.companyName || !req.body.companyName.trim()) return res.status(400).json({ error: 'companyName is required' });
  const f = fromBody(req.body);
  const { rowCount } = await pool.query(
    `UPDATE customers SET company_name=$1, source_id=$2, contact_name=$3, email=$4, phone_primary=$5, phone_secondary=$6, contact_name2=$7, email2=$8, phone2_primary=$9, phone2_secondary=$10, ribbon_color=$11, font_color=$12, logo_url=$13, notes=$14
     WHERE id=$15`,
    [f.company_name, f.source_id, f.contact_name, f.email, f.phone_primary, f.phone_secondary, f.contact_name2, f.email2, f.phone2_primary, f.phone2_secondary, f.ribbon_color, f.font_color, f.logo_url, f.notes, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Customer not found' });
  res.json({ id: req.params.id, customers: await list() });
});

router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE orders SET customer_id = NULL WHERE customer_id = $1', [req.params.id]);
    await client.query('UPDATE proposals SET customer_id = NULL WHERE customer_id = $1', [req.params.id]);
    await client.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await list());
});

// Bulk upsert from a parsed CSV. Source is matched by label text since the
// export uses the human-readable label, not the internal id.
router.post('/import', async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  let added = 0;
  let updated = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: sources } = await client.query('SELECT id, label FROM sources');
    for (const row of rows) {
      const companyName = (row.companyName || '').toString().trim();
      if (!companyName) continue;
      let existing = null;
      if (row.id) {
        const { rows: found } = await client.query('SELECT id, source_id FROM customers WHERE id = $1', [row.id]);
        existing = found[0] || null;
      }
      const sourceText = (row.source || row.sourceLabel || '').toString().trim();
      const matchedSource = sourceText ? sources.find((s) => (s.label || '').toLowerCase() === sourceText.toLowerCase()) : null;
      const f = fromBody({
        ...row,
        sourceId: matchedSource ? matchedSource.id : existing ? existing.source_id : null,
      });
      if (existing) {
        await client.query(
          `UPDATE customers SET company_name=$1, source_id=$2, contact_name=$3, email=$4, phone_primary=$5, phone_secondary=$6, contact_name2=$7, email2=$8, phone2_primary=$9, phone2_secondary=$10, ribbon_color=$11, font_color=$12, notes=$13
           WHERE id=$14`,
          [f.company_name, f.source_id, f.contact_name, f.email, f.phone_primary, f.phone_secondary, f.contact_name2, f.email2, f.phone2_primary, f.phone2_secondary, f.ribbon_color, f.font_color, f.notes, existing.id]
        );
        updated++;
      } else {
        const id = uid('cus');
        await client.query(
          `INSERT INTO customers (id, company_name, source_id, contact_name, email, phone_primary, phone_secondary, contact_name2, email2, phone2_primary, phone2_secondary, ribbon_color, font_color, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [id, f.company_name, f.source_id, f.contact_name, f.email, f.phone_primary, f.phone_secondary, f.contact_name2, f.email2, f.phone2_primary, f.phone2_secondary, f.ribbon_color, f.font_color, f.notes]
        );
        added++;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ added, updated, customers: await list() });
});

export default router;
export { list as listCustomers };

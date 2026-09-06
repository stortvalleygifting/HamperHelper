import { Router } from 'express';
import { pool } from '../db.js';
import { uid } from '../lib/ids.js';
import { proposalToApi } from '../lib/mappers.js';
import { docUpload } from '../lib/storage.js';

const router = Router();
const PROPOSAL_SLOTS = 10;

async function listProposals() {
  const { rows: proposals } = await pool.query('SELECT * FROM proposals ORDER BY proposal_date DESC NULLS LAST, id DESC');
  const { rows: hampers } = await pool.query('SELECT * FROM proposal_hampers ORDER BY id ASC');
  const byProposal = new Map();
  for (const h of hampers) {
    if (!byProposal.has(h.proposal_id)) byProposal.set(h.proposal_id, []);
    byProposal.get(h.proposal_id).push(h);
  }
  return proposals.map((p) => proposalToApi(p, byProposal.get(p.id) || []));
}

async function saveHampers(client, proposalId, hamperIds) {
  await client.query('DELETE FROM proposal_hampers WHERE proposal_id = $1', [proposalId]);
  const slots = (hamperIds || []).slice(0, PROPOSAL_SLOTS);
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i]) continue;
    await client.query('INSERT INTO proposal_hampers (proposal_id, slot_index, product_id) VALUES ($1,$2,$3)', [proposalId, i, slots[i]]);
  }
}

router.get('/', async (req, res) => {
  res.json(await listProposals());
});

router.post('/', async (req, res) => {
  const chosen = (req.body.hamperIds || []).filter(Boolean);
  if (new Set(chosen).size !== chosen.length) return res.status(400).json({ error: 'The same hamper has been chosen more than once' });
  const id = uid('prp');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO proposals (id, customer_id, proposal_date) VALUES ($1,$2,$3)', [id, req.body.customerId || null, req.body.proposalDate || null]);
    await saveHampers(client, id, req.body.hamperIds);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json(await listProposals());
});

router.put('/:id', async (req, res) => {
  const chosen = (req.body.hamperIds || []).filter(Boolean);
  if (new Set(chosen).size !== chosen.length) return res.status(400).json({ error: 'The same hamper has been chosen more than once' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('UPDATE proposals SET customer_id=$1, proposal_date=$2 WHERE id=$3', [req.body.customerId || null, req.body.proposalDate || null, req.params.id]);
    if (!rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Proposal not found' });
    }
    await saveHampers(client, req.params.id, req.body.hamperIds);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await listProposals());
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM proposals WHERE id = $1', [req.params.id]);
  res.json(await listProposals());
});

// Store a generated or user-edited proposal document (.docx). The frontend
// still builds the docx itself (via JSZip, in the browser) since that's
// where the photo compositing already happens; this just persists the result.
router.post('/:id/document', docUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No document uploaded' });
  const source = req.body.source === 'uploaded' ? 'uploaded' : 'generated';
  const docName = req.body.docName || req.file.originalname || 'Proposal.docx';
  const docUrl = `/uploads/proposals/${req.file.filename}`;
  const { rowCount } = await pool.query('UPDATE proposals SET doc_name=$1, doc_source=$2, doc_url=$3 WHERE id=$4', [docName, source, docUrl, req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Proposal not found' });
  res.status(201).json(await listProposals());
});

export default router;
export { listProposals };

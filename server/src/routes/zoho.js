import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { requireAdmin } from '../lib/access.js';
import {
  ZOHO_REGIONS, ZOHO_SCOPES, accountsUrlFor, isZohoAccountsServer, zohoConfigured,
  exchangeCode, getConnection, forgetAccessToken, zohoBooks, booksWebUrl,
} from '../lib/zoho.js';
import { invoiceLinesForOrder } from '../lib/invoiceLines.js';
import {
  listZohoCustomers, searchZohoCustomers, matchCandidates, customerFieldsFromContact, findOrCreateZohoContact,
} from '../lib/zohoContacts.js';
import { listCustomers } from './customers.js';
import { syncSentInvoices } from '../lib/zohoSync.js';
import { INVOICE_VAT_LABELS } from './reports.js';
import { listOrders } from './orders.js';
import { listProducts } from './products.js';
import { listStock } from './stock.js';
import { listPackaging } from './packaging.js';
import { listShipping } from './shipping.js';

const router = Router();

function redirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/zoho/callback`;
}

// Anyone logged in can see whether Zoho is connected (orders link to their
// Zoho invoice); only admins can connect, disconnect or create invoices.
router.get('/status', async (req, res) => {
  const conn = await getConnection();
  res.json({
    configured: zohoConfigured(),
    connected: !!conn,
    organizationName: conn ? conn.organization_name : null,
    connectedBy: conn ? conn.connected_by : null,
    invoiceUrlBase: conn ? booksWebUrl(conn, 'invoices', '') : null,
    contactUrlBase: conn ? booksWebUrl(conn, 'contacts', '') : null,
    regions: Object.entries(ZOHO_REGIONS).map(([id, r]) => ({ id, label: r.label })),
    redirectUri: redirectUri(req),
  });
});

router.get('/connect', requireAdmin, (req, res) => {
  if (!zohoConfigured()) return res.redirect('/?zoho_error=' + encodeURIComponent('Add ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET in Railway first') + '#reports');
  const region = ZOHO_REGIONS[req.query.region] ? req.query.region : 'uk';
  const state = crypto.randomBytes(16).toString('hex');
  req.session.zohoOAuth = { state, region };
  const qs = new URLSearchParams({
    scope: ZOHO_SCOPES, client_id: process.env.ZOHO_CLIENT_ID, response_type: 'code',
    access_type: 'offline', prompt: 'consent', redirect_uri: redirectUri(req), state,
  });
  res.redirect(`${accountsUrlFor(region)}/oauth/v2/auth?${qs}`);
});

router.get('/callback', requireAdmin, async (req, res) => {
  const back = (param, msg) => res.redirect(`/?${param}=${encodeURIComponent(msg)}#reports`);
  const pending = req.session.zohoOAuth;
  delete req.session.zohoOAuth;
  if (!pending || !req.query.state || req.query.state !== pending.state) return back('zoho_error', 'That Zoho sign-in had expired. Please try Connect again.');
  if (req.query.error) return back('zoho_error', `Zoho said: ${req.query.error}`);
  const accountsServer = req.query['accounts-server'] || accountsUrlFor(pending.region);
  if (!isZohoAccountsServer(accountsServer)) return back('zoho_error', 'Unexpected Zoho sign-in server');
  try {
    const tokens = await exchangeCode(accountsServer, req.query.code, redirectUri(req));
    if (!tokens.refresh_token) throw new Error('Zoho did not give a lasting connection. Please try Connect again.');
    const conn = { accounts_server: accountsServer, api_domain: tokens.api_domain || 'https://www.zohoapis.com', refresh_token: tokens.refresh_token };
    const orgs = (await zohoBooks(conn, 'GET', '/organizations', { accessTokenOverride: tokens.access_token })).organizations || [];
    const org = orgs.find((o) => o.is_default_org) || orgs[0];
    if (!org) throw new Error('No Zoho Books organisation found on that account');
    await pool.query(
      `INSERT INTO zoho_connection (id, accounts_server, api_domain, refresh_token, organization_id, organization_name, connected_by, connected_at)
       VALUES (1,$1,$2,$3,$4,$5,$6,now())
       ON CONFLICT (id) DO UPDATE SET accounts_server=$1, api_domain=$2, refresh_token=$3, organization_id=$4, organization_name=$5, connected_by=$6, connected_at=now()`,
      [conn.accounts_server, conn.api_domain, conn.refresh_token, String(org.organization_id), org.name || '', req.staff.username]
    );
    forgetAccessToken();
    back('zoho', 'connected');
  } catch (err) {
    back('zoho_error', err.message);
  }
});

router.post('/disconnect', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM zoho_connection');
  forgetAccessToken();
  res.json({ ok: true });
});

// Zoho tax for one of our VAT rates: by the name the CSV import used
// ("Standard Rate"), else by percentage.
function pickTax(taxes, rate, vatPct) {
  const byName = INVOICE_VAT_LABELS[rate];
  const exempt = String(rate).toLowerCase().includes('exempt');
  const named = byName && taxes.find((t) => String(t.tax_name || '').toLowerCase() === byName.toLowerCase());
  if (named) return named;
  return taxes.find((t) => Number(t.tax_percentage) === vatPct && (String(t.tax_name || '').toLowerCase().includes('exempt') === exempt))
    || taxes.find((t) => Number(t.tax_percentage) === vatPct);
}

async function zohoContactId(conn, customer) {
  if (customer.zoho_contact_id) return customer.zoho_contact_id;
  const id = await findOrCreateZohoContact(conn, customer);
  await pool.query('UPDATE customers SET zoho_contact_id = $1 WHERE id = $2', [id, customer.id]);
  return id;
}

const inFlight = new Set(); // order ids being invoiced right now

async function createDraftInvoice(conn, ctx, orderId) {
  if (inFlight.has(orderId)) throw new Error('Already being sent to Zoho');
  inFlight.add(orderId);
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = rows[0];
    if (!order) throw new Error('Order not found');
    if (order.zoho_invoice_id) throw new Error(`Already has Zoho invoice ${order.zoho_invoice_number || ''}`.trim());
    const { rows: custRows } = await pool.query('SELECT * FROM customers WHERE id = $1', [order.customer_id]);
    const customer = custRows[0];
    if (!customer) throw new Error('The order has no customer');
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [orderId]);
    const lines = invoiceLinesForOrder(items, ctx.maps);
    if (!lines.length) throw new Error('No hampers or items with a quantity to invoice');

    if (!ctx.taxes) ctx.taxes = (await zohoBooks(conn, 'GET', '/settings/taxes')).taxes || [];
    const lineItems = [];
    for (const line of lines) {
      const tax = pickTax(ctx.taxes, line.rate, line.vatPct);
      if (!tax) throw new Error(`Zoho has no ${line.vatPct}% tax set up`);
      // A free-text line: no Zoho item is looked up or created.
      const lineItem = { name: line.name.slice(0, 100), rate: line.unitPriceIncVat, quantity: line.qty, tax_id: tax.tax_id };
      if (line.name.length > 100) lineItem.description = line.name;
      lineItems.push(lineItem);
    }
    const body = {
      customer_id: await zohoContactId(conn, customer),
      date: new Date().toISOString().slice(0, 10),
      reference_number: order.id,
      is_inclusive_tax: true,
      line_items: lineItems,
    };
    if (order.notes) body.notes = order.notes;
    // Not sent: it lands in Zoho as a draft for checking.
    const invoice = (await zohoBooks(conn, 'POST', '/invoices', { body })).invoice;
    await pool.query(
      'UPDATE orders SET zoho_invoice_id = $1, zoho_invoice_number = $2, invoice_number = $2, ready_to_invoice = false, zoho_invoice_status = \'draft\' WHERE id = $3',
      [String(invoice.invoice_id), invoice.invoice_number, orderId]
    );
    return invoice.invoice_number;
  } finally {
    inFlight.delete(orderId);
  }
}

// body: { orderIds: [...] } or { allReady: true }. Each order becomes one
// draft invoice; one failing doesn't stop the rest.
router.post('/invoices', requireAdmin, async (req, res) => {
  const conn = await getConnection();
  if (!conn) return res.status(400).json({ error: 'Zoho Books is not connected yet' });
  let orderIds = Array.isArray(req.body.orderIds) ? req.body.orderIds : [];
  if (req.body.allReady) {
    const { rows } = await pool.query('SELECT id FROM orders WHERE ready_to_invoice = true AND zoho_invoice_id IS NULL ORDER BY order_date NULLS LAST, id');
    orderIds = rows.map((r) => r.id);
  }
  if (!orderIds.length) return res.status(400).json({ error: req.body.allReady ? 'No orders are marked ready to invoice' : 'No order chosen' });
  const [products, stock, packaging, shipping] = await Promise.all([listProducts(), listStock(), listPackaging(), listShipping()]);
  const ctx = {
    maps: {
      productById: new Map(products.map((p) => [p.id, p])), stockById: new Map(stock.map((s) => [s.id, s])),
      packagingById: new Map(packaging.map((p) => [p.id, p])), shippingById: new Map(shipping.map((s) => [s.id, s])),
    },
    taxes: null,
  };
  const results = [];
  for (const id of orderIds) {
    try {
      results.push({ orderId: id, ok: true, invoiceNumber: await createDraftInvoice(conn, ctx, id) });
    } catch (err) {
      results.push({ orderId: id, ok: false, error: err.message });
    }
  }
  res.json({ results, orders: await listOrders() });
});

// ---- Customers <-> Zoho contacts ----

async function needConnection(res) {
  const conn = await getConnection();
  if (!conn) res.status(400).json({ error: 'Zoho Books is not connected yet' });
  return conn;
}

async function linkedNames() {
  const { rows } = await pool.query('SELECT id, company_name, zoho_contact_id FROM customers WHERE zoho_contact_id IS NOT NULL');
  return new Map(rows.map((r) => [r.zoho_contact_id, { id: r.id, name: r.company_name }]));
}

// Search Zoho customers by name (or email, if it has an @), for adding or
// linking a customer. Any staff member can, like adding a customer.
router.get('/contacts', async (req, res) => {
  const text = String(req.query.search || '').trim().slice(0, 100);
  if (text.length < 2) return res.status(400).json({ error: 'Type at least 2 letters to search Zoho' });
  const conn = await needConnection(res);
  if (!conn) return;
  const [found, linked] = await Promise.all([searchZohoCustomers(conn, text), linkedNames()]);
  res.json(found.map((c) => ({ ...c, linkedTo: linked.get(c.id) || null })));
});

// One Zoho contact as customer fields, to fill in the customer pop-up.
router.get('/contacts/:id', async (req, res) => {
  const conn = await needConnection(res);
  if (!conn) return;
  const { contact } = await zohoBooks(conn, 'GET', `/contacts/${encodeURIComponent(req.params.id)}`);
  res.json({ id: String(contact.contact_id), fields: customerFieldsFromContact(contact) });
});

// Suggested Zoho matches for every customer not yet linked to Zoho.
router.get('/customer-matches', requireAdmin, async (req, res) => {
  const conn = await needConnection(res);
  if (!conn) return;
  const [zoho, linked, { rows: customers }] = await Promise.all([
    listZohoCustomers(conn), linkedNames(),
    pool.query('SELECT * FROM customers WHERE zoho_contact_id IS NULL ORDER BY company_name'),
  ]);
  const { rows: [{ n: linkedCount }] } = await pool.query('SELECT count(*)::int AS n FROM customers WHERE zoho_contact_id IS NOT NULL');
  res.json({
    zohoCount: zoho.length,
    linkedCount,
    customers: customers.map((c) => ({
      id: c.id, companyName: c.company_name, contactName: c.contact_name || '', email: c.email || '',
      candidates: matchCandidates(c, zoho).map((z) => ({ ...z, linkedTo: linked.get(z.id) || null })),
    })),
  });
});

// Rob confirmed this customer is that Zoho contact: link them and take
// Zoho's name.
router.post('/customer-link', requireAdmin, async (req, res) => {
  const conn = await needConnection(res);
  if (!conn) return;
  const { customerId, contactId } = req.body || {};
  if (!customerId || !contactId) return res.status(400).json({ error: 'Choose a customer and a Zoho contact' });
  const { contact } = await zohoBooks(conn, 'GET', `/contacts/${encodeURIComponent(contactId)}`);
  const name = contact.contact_name || contact.company_name;
  const { rowCount } = await pool.query(
    'UPDATE customers SET zoho_contact_id = $1, company_name = COALESCE(NULLIF($2, \'\'), company_name) WHERE id = $3',
    [String(contact.contact_id), name || '', customerId]
  );
  if (!rowCount) return res.status(404).json({ error: 'Customer not found' });
  res.json({ customers: await listCustomers() });
});

// No match in Zoho: create the customer there (or link one with exactly
// the same name, if it turns up).
router.post('/customer-create', requireAdmin, async (req, res) => {
  const conn = await needConnection(res);
  if (!conn) return;
  const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.body && req.body.customerId]);
  if (!rows[0]) return res.status(404).json({ error: 'Customer not found' });
  if (rows[0].zoho_contact_id) return res.status(400).json({ error: 'That customer is already linked to Zoho' });
  const id = await findOrCreateZohoContact(conn, rows[0]);
  await pool.query('UPDATE customers SET zoho_contact_id = $1 WHERE id = $2', [id, rows[0].id]);
  res.json({ customers: await listCustomers() });
});

// "Check now" on Reports, instead of waiting for the next 5-minute check.
router.post('/sync-sent', requireAdmin, async (req, res) => {
  const conn = await needConnection(res);
  if (!conn) return;
  const result = await syncSentInvoices();
  res.json({ ...result, orders: await listOrders() });
});

export default router;

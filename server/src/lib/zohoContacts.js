// Customers <-> Zoho Books contacts: matching existing customers to Zoho,
// turning a Zoho contact into customer fields, and a customer into a new
// Zoho contact. Nothing here writes to the database.
import { zohoBooks } from './zoho.js';

const SUFFIXES = new Set(['ltd', 'limited', 'plc', 'llp', 'llc', 'inc', 'co', 'company', 'uk', 'the', 'group']);
const GENERIC_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk',
  'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'aol.com', 'btinternet.com', 'sky.com', 'virginmedia.com', 'msn.com']);

export function nameTokens(s) {
  return String(s || '').toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter((t) => t && !SUFFIXES.has(t));
}
const normName = (s) => nameTokens(s).join(' ');
const lc = (s) => String(s || '').trim().toLowerCase();
const domainOf = (email) => (lc(email).split('@')[1] || '');

export function contactSummary(c) {
  const person = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return {
    id: String(c.contact_id),
    name: c.contact_name || c.company_name || '',
    contactPerson: person,
    email: c.email || '',
    phone: c.phone || c.mobile || '',
  };
}

// Score how likely Zoho contact z is the same customer as HamperHelper
// customer row cust. 0 means no reason to think so.
function scoreMatch(cust, z) {
  const reasons = [];
  let score = 0;
  const a = normName(cust.company_name), b = normName(z.name);
  if (a && a === b) { score = 100; reasons.push(lc(cust.company_name) === lc(z.name) ? 'Same name' : 'Nearly the same name'); }
  else if (a && b && Math.min(a.length, b.length) >= 4 && (` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `))) { score = 60; reasons.push('Similar name'); }
  else {
    // Shared words, counting "Tech" and "Technology" as the same word.
    const ta = [...new Set(nameTokens(cust.company_name))], tb = [...new Set(nameTokens(z.name))];
    const same = (x, y) => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
    const shared = ta.filter((t) => t.length > 2 && tb.some((u) => same(t, u))).length;
    const jaccard = shared / ((ta.length + tb.length - shared) || 1);
    if (jaccard >= 0.5) { score = 45; reasons.push('Similar name'); }
  }
  const emails = [cust.email, cust.email2].map(lc).filter(Boolean);
  if (z.email && emails.includes(lc(z.email))) { score = Math.max(score, 90) + (score ? 5 : 0); reasons.push('Same email'); }
  else if (z.email && !GENERIC_DOMAINS.has(domainOf(z.email)) && emails.some((e) => domainOf(e) === domainOf(z.email))) {
    score = Math.max(score, 50) + (score ? 10 : 0); reasons.push('Same email domain');
  }
  const people = [cust.contact_name, cust.contact_name2].map(normName).filter(Boolean);
  if (score && z.contactPerson && people.includes(normName(z.contactPerson))) { score += 10; reasons.push('Same contact'); }
  return { score: Math.min(score, 100), reason: reasons.join(', ') };
}

export function matchCandidates(cust, zohoContacts, limit = 3) {
  return zohoContacts
    .map((z) => ({ ...z, ...scoreMatch(cust, z) }))
    .filter((z) => z.score >= 40)
    .sort((x, y) => y.score - x.score || x.name.localeCompare(y.name))
    .slice(0, limit);
}

// Every active customer contact in Zoho, summarised. Read only; nothing is
// stored.
export async function listZohoCustomers(conn) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const data = await zohoBooks(conn, 'GET', '/contacts', { query: { contact_type: 'customer', filter_by: 'Status.Active', per_page: 200, page } });
    out.push(...(data.contacts || []).map(contactSummary));
    if (!(data.page_context && data.page_context.has_more_page)) break;
  }
  return out;
}

export async function searchZohoCustomers(conn, text) {
  const query = { contact_type: 'customer', per_page: 25 };
  if (text.includes('@')) query.email_contains = text; else query.contact_name_contains = text;
  const data = await zohoBooks(conn, 'GET', '/contacts', { query });
  return (data.contacts || []).map(contactSummary);
}

// HamperHelper customer fields from a full Zoho contact (GET /contacts/:id).
// The primary contact person fills the main contact, the next one the 2nd.
export function customerFieldsFromContact(c) {
  const persons = (c.contact_persons || []).slice().sort((x, y) => (y.is_primary_contact ? 1 : 0) - (x.is_primary_contact ? 1 : 0));
  const p1 = persons[0] || { first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone, mobile: c.mobile };
  const p2 = persons[1] || {};
  const name = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ');
  const phones = (p) => [p.phone, p.mobile].filter(Boolean);
  return {
    companyName: c.contact_name || c.company_name || '',
    contactName: name(p1),
    email: p1.email || '',
    phonePrimary: phones(p1)[0] || '',
    phoneSecondary: phones(p1)[1] || '',
    contactName2: name(p2),
    email2: p2.email || '',
    phone2Primary: phones(p2)[0] || '',
    phone2Secondary: phones(p2)[1] || '',
  };
}

// A new Zoho contact for a customer row (snake_case, as stored).
export function contactBodyFromCustomer(cust) {
  const person = (fullName, email, phone, mobile, primary) => {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    const p = { first_name: parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || ''), last_name: parts.length > 1 ? parts[parts.length - 1] : '' };
    if (email) p.email = email;
    if (phone) p.phone = phone;
    if (mobile) p.mobile = mobile;
    if (primary) p.is_primary_contact = true;
    return p;
  };
  const body = { contact_name: cust.company_name, company_name: cust.company_name, contact_type: 'customer', customer_sub_type: 'business' };
  const persons = [];
  if (cust.contact_name || cust.email || cust.phone_primary) persons.push(person(cust.contact_name, cust.email, cust.phone_primary, cust.phone_secondary, true));
  if (cust.contact_name2 || cust.email2 || cust.phone2_primary) persons.push(person(cust.contact_name2, cust.email2, cust.phone2_primary, cust.phone2_secondary, false));
  // Zoho insists every contact person has a first name or email.
  const usable = persons.filter((p) => p.first_name || p.email);
  if (usable.length) body.contact_persons = usable;
  return body;
}

// The Zoho contact for this customer: an existing one with exactly the same
// name, or a new one. Returns its id.
export async function findOrCreateZohoContact(conn, cust) {
  const found = ((await zohoBooks(conn, 'GET', '/contacts', { query: { contact_name: cust.company_name, contact_type: 'customer' } })).contacts || [])
    .find((c) => lc(c.contact_name) === lc(cust.company_name));
  if (found) return String(found.contact_id);
  return String((await zohoBooks(conn, 'POST', '/contacts', { body: contactBodyFromCustomer(cust) })).contact.contact_id);
}

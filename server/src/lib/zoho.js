import { pool } from '../db.js';

// Talking to Zoho Books on Stort Valley's behalf. An admin connects once
// (OAuth, "server-based application" registered in Zoho's API Console); the
// refresh token is kept in zoho_connection and never leaves the server.
// Needs ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET in the environment.

// Zoho keeps each account in one region; sign-in starts at that region's
// accounts server.
export const ZOHO_REGIONS = {
  uk: { label: 'United Kingdom (zoho.uk)', accounts: 'https://accounts.zoho.uk' },
  eu: { label: 'Europe (zoho.eu)', accounts: 'https://accounts.zoho.eu' },
  com: { label: 'United States (zoho.com)', accounts: 'https://accounts.zoho.com' },
  in: { label: 'India (zoho.in)', accounts: 'https://accounts.zoho.in' },
  au: { label: 'Australia (zoho.com.au)', accounts: 'https://accounts.zoho.com.au' },
  ca: { label: 'Canada (zohocloud.ca)', accounts: 'https://accounts.zohocloud.ca' },
  jp: { label: 'Japan (zoho.jp)', accounts: 'https://accounts.zoho.jp' },
  sa: { label: 'Saudi Arabia (zoho.sa)', accounts: 'https://accounts.zoho.sa' },
};

export const ZOHO_SCOPES = [
  'ZohoBooks.invoices.CREATE', 'ZohoBooks.invoices.READ',
  'ZohoBooks.contacts.CREATE', 'ZohoBooks.contacts.READ',
  'ZohoBooks.settings.READ', 'ZohoBooks.settings.CREATE',
].join(',');

// ZOHO_TEST_ACCOUNTS_URL points every region at a local stand-in Zoho, for
// testing only.
export function accountsUrlFor(region) {
  if (process.env.ZOHO_TEST_ACCOUNTS_URL) return process.env.ZOHO_TEST_ACCOUNTS_URL;
  return (ZOHO_REGIONS[region] || ZOHO_REGIONS.uk).accounts;
}

// The accounts server Zoho names on the way back must really be Zoho's.
export function isZohoAccountsServer(url) {
  if (process.env.ZOHO_TEST_ACCOUNTS_URL && url === process.env.ZOHO_TEST_ACCOUNTS_URL) return true;
  return /^https:\/\/accounts\.(zoho\.(com|eu|in|uk|jp|sa|com\.au|com\.cn)|zohocloud\.ca)$/.test(url || '');
}

export function zohoConfigured() {
  return !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
}

async function tokenRequest(accountsServer, params) {
  const qs = new URLSearchParams({ client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET, ...params });
  const res = await fetch(`${accountsServer}/oauth/v2/token?${qs}`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) throw new Error(`Zoho sign-in failed: ${data.error || res.status}`);
  return data;
}

export async function exchangeCode(accountsServer, code, redirectUri) {
  return tokenRequest(accountsServer, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

export async function getConnection() {
  const { rows } = await pool.query('SELECT * FROM zoho_connection WHERE id = 1');
  return rows[0] || null;
}

let cachedToken = null; // { token, expiresAt, refreshToken }

async function accessToken(conn) {
  if (cachedToken && cachedToken.refreshToken === conn.refresh_token && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const data = await tokenRequest(conn.accounts_server, { grant_type: 'refresh_token', refresh_token: conn.refresh_token });
  cachedToken = { token: data.access_token, refreshToken: conn.refresh_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

export function forgetAccessToken() { cachedToken = null; }

// Calls the Books API (path like '/invoices'), adding the organisation.
export async function zohoBooks(conn, method, path, { query, body, accessTokenOverride } = {}) {
  const token = accessTokenOverride || (await accessToken(conn));
  const qs = new URLSearchParams({ ...(conn.organization_id ? { organization_id: conn.organization_id } : {}), ...(query || {}) });
  const res = await fetch(`${conn.api_domain}/books/v3${path}?${qs}`, {
    method,
    headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.code !== undefined && data.code !== 0)) {
    throw new Error(`Zoho: ${data.message || `request failed (${res.status})`}`);
  }
  return data;
}

// Where an admin can open a Books record in the browser, e.g.
// https://www.zohoapis.eu -> https://books.zoho.eu.
export function booksWebUrl(conn, invoiceId) {
  const host = conn.api_domain
    .replace('://www.zohoapis.ca', '://books.zohocloud.ca')
    .replace('://www.zohoapis.', '://books.zoho.')
    .replace('://zohoapis.', '://books.zoho.');
  return `${host}/app/${conn.organization_id}#/invoices/${invoiceId}`;
}

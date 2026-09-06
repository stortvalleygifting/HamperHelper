import crypto from 'node:crypto';

// Mirrors the shape of ids the original client-only app generated
// (e.g. "stk-4f9ab2c1"), just now minted server-side.
export function uid(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

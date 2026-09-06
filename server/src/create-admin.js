// One-off CLI to create (or reset the password of) a staff account —
// mainly for bootstrapping the first admin, since the staff list can only
// otherwise be managed by someone who's already logged in.
//
// Usage: npm run create-admin -- --username=admin --password=... [--name="Jo Bloggs"] [--admin=false]
import 'dotenv/config';
import { pool } from './db.js';
import { uid } from './lib/ids.js';
import { hashPassword } from './lib/passwords.js';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const username = (args.username || '').trim();
  const password = args.password || '';
  if (!username || !password) {
    console.error('Usage: npm run create-admin -- --username=admin --password=... [--name="Jo Bloggs"] [--admin=false]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }
  const isAdmin = args.admin === undefined ? true : args.admin !== 'false';
  const displayName = args.name || '';

  const { rows } = await pool.query('SELECT id FROM staff WHERE username = $1', [username]);
  if (rows[0]) {
    await pool.query('UPDATE staff SET password_hash = $1, display_name = $2, is_admin = $3 WHERE id = $4', [
      hashPassword(password), displayName, isAdmin, rows[0].id,
    ]);
    console.log(`Updated existing staff account "${username}".`);
  } else {
    await pool.query('INSERT INTO staff (id, username, password_hash, display_name, is_admin) VALUES ($1,$2,$3,$4,$5)', [
      uid('stf'), username, hashPassword(password), displayName, isAdmin,
    ]);
    console.log(`Created staff account "${username}".`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

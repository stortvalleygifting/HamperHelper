import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(__dirname, '../../db');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function alreadyApplied(client, name) {
  const { rows } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
  return rows.length > 0;
}

async function apply(client, name, sql) {
  console.log(`Applying ${name}...`);
  await client.query(sql);
  await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
}

async function main() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const steps = [
      ['0000_schema.sql', path.join(dbDir, 'schema.sql')],
      ...fs
        .readdirSync(path.join(dbDir, 'migrations'))
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => [f, path.join(dbDir, 'migrations', f)]),
    ];

    for (const [name, filePath] of steps) {
      if (await alreadyApplied(client, name)) {
        console.log(`Skipping ${name} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query('BEGIN');
      try {
        await apply(client, name, sql);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    const seedPath = path.join(dbDir, 'seed.sql');
    if (process.argv.includes('--seed') && fs.existsSync(seedPath)) {
      console.log('Applying seed.sql...');
      await client.query(fs.readFileSync(seedPath, 'utf8'));
    }

    console.log('Migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

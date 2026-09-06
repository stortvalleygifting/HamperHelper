import pg from 'pg';

const { Pool, types } = pg;

// NUMERIC columns (cost/price/weight/qty) come back as strings by default,
// which silently turns `+=` into string concatenation throughout the
// frontend's pricing math. Parse them as floats instead.
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

// DATE columns default to JS Date objects in local time, which shifts the
// calendar day depending on the server's timezone. Keep the plain
// 'YYYY-MM-DD' string the frontend's <input type="date"> already expects.
types.setTypeParser(1082, (val) => val);

if (!process.env.DATABASE_URL) {
  // Temporary diagnostic for a Railway deploy where DATABASE_URL isn't
  // showing up despite being set in the dashboard — logs which relevant
  // variable *names* actually exist in this container (never values), so we
  // can tell a propagation/naming problem from a scoping/environment one.
  // TODO: remove once the Railway deploy is confirmed working.
  const relevant = Object.keys(process.env)
    .filter((k) => /DATABASE|POSTGRES|^PG|RAILWAY/i.test(k))
    .sort();
  console.error('[diagnostic] DATABASE_URL is missing. Relevant env var names present:', relevant.length ? relevant : '(none found)');
  console.error('[diagnostic] Total env var count:', Object.keys(process.env).length);
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function withTransaction(fn) {
  return pool.connect().then(async (client) => {
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}

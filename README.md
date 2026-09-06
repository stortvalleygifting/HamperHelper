# Hamper Helper

Stort Valley Gifting's operations app — hampers, stock, customers, orders,
proposals — backed by Postgres, with an Express API and a plain-JS frontend
(no build step).

This started life as a single-file HTML artifact that kept all its data in
`window.storage`. It's now a normal three-tier app: Postgres for storage, an
Express API for business logic (pricing, order flow, invoicing), and the same
frontend UI talking to that API over `fetch` instead of local storage.

## Layout

```
package.json         root manifest — exists solely so PaaS builders (Railway, etc.)
                      detect a Node app at the repo root and run server/ (see Deploying below)
railway.json          explicit Railway build/start config, as a belt-and-suspenders
db/                 schema.sql (as specified), migrations/, seed.sql
server/             Express API
  src/
    routes/          one file per resource (stock, products, orders, ...)
    lib/             ids, pricing math, CSV, file storage helpers
    migrate.js        migration runner
    app.js / index.js Express app + entrypoint
  assets/proposal-template.docx   the Word template used to generate proposals
  uploads/           runtime dir for uploaded/generated images & documents (gitignored)
public/              frontend: index.html, app.js, api.js, styles.css
```

## Setup

Requires Node 18+ and a Postgres database.

```bash
cd server
npm install
cp .env.example .env   # fill in DATABASE_URL and SESSION_SECRET
npm run migrate -- --seed   # creates tables + default packaging/shipping options
npm run create-admin -- --username=admin --password=... --name="Your Name"   # first login
npm start                   # serves the API and the frontend on $PORT (default 3000)
```

Then open `http://localhost:3000` and log in with the account you just created.

For local development, `npm run dev` restarts the server on file changes.

## Database

`db/schema.sql` is the core schema. A few additive columns the original
artifact's feature set needed but the base schema didn't have live in
`db/migrations/`:

- `orders.invoice_number` — so an order invoiced once keeps the same number.
- `proposals.doc_name` / `doc_source` / `doc_url` — proposals can carry a
  generated or manually-edited Word document; it's stored as a file (see
  below) with a reference here, the same way products/customers reference
  their photo/logo.

`npm run migrate` applies `schema.sql` then everything in `migrations/` in
order, tracked in a `schema_migrations` table so it's safe to re-run.
`npm run migrate -- --seed` additionally loads `db/seed.sql`, which seeds the
same default packaging/shipping options the original artifact used to create
on first run.

One deliberate schema-driven behavior change: `shipping_options` (per the
given schema) only has `label`, `price`, and `vat` — no `weight`/`cost` like
`packaging_options` has. Shipping is treated as a pass-through customer
charge rather than a tracked cost, so a hamper's total *cost* doesn't include
its shipping option (its *price* still does).

## Staff login

The whole app sits behind a simple username/password login (`server/src/lib/session.js`
+ `server/src/routes/auth.js`). Sessions are cookie-based, stored in Postgres
via `connect-pg-simple` (it creates its own `session` table automatically —
no migration needed for that part). Passwords are hashed with `scrypt`
(`server/src/lib/passwords.js`); nothing plaintext ever touches the database
or the API responses.

Staff accounts live in the `staff` table (migration `003_staff.sql`) and are
managed from the **Staff** tab once logged in — add, edit (including
resetting a password), and delete. Two guardrails on delete: you can't delete
your own account while logged into it, and the last remaining account can't
be deleted, so it's impossible to lock everyone out through the UI.

Since the staff list starts empty, there's no way to log in until you create
the first account from the command line:

```bash
npm run create-admin -- --username=admin --password=... [--name="Jo Bloggs"] [--admin=false]
```

Running it again with an existing username resets that account's password —
handy if everyone gets locked out.

## Deploying (Railway or similar)

The Express server serves both the API *and* the `public/` frontend (see
`server/src/app.js`'s trailing `app.use(express.static(publicDir))`) — there
is no separate static site to deploy. The app's actual `package.json` lives
in `server/`, though, so a builder that only looks at the repo root (Railway
included, when its service's Root Directory is left at `/`) won't find a
Node app to run there and can fall back to treating `public/` as a static
site instead — which is why `/api/*` routes 404 in that failure mode: nothing
is running Express at all.

The root-level `package.json` and `railway.json` fix that: they give the
builder a Node app to detect at the repo root, whose `start` script runs the
migration and then starts the real server in `server/`. If you'd rather point
Railway straight at the subfolder instead, set the service's **Root
Directory** to `server` in its settings and use `server/package.json`'s
`start` script directly (skipping `npm run migrate` — run that once
separately, e.g. via `railway run npm run migrate`).

Either way, set these environment variables on the Railway service:
`DATABASE_URL` (Railway's Postgres plugin injects this automatically if
attached), `SESSION_SECRET`, and `NODE_ENV=production`. `PORT` is provided by
Railway itself — the server already reads `process.env.PORT`. After the
first deploy, create the first login with
`railway run npm run create-admin --prefix server -- --username=... --password=...`.

## Uploads

Product photos and customer logos are uploaded to `POST /api/uploads` and
served back from `/uploads/images/...`; proposal documents (generated or
user-edited `.docx`) go through `POST /api/proposals/:id/document` and are
served from `/uploads/proposals/...`. Both are plain local disk storage under
`server/uploads/` — swap `UPLOADS_DIR` (or the storage helpers in
`server/src/lib/storage.js`) for object storage if you need it to survive
across deploys/containers.

## Proposal documents

The Word template that used to be embedded as a ~900KB base64 string inside
the frontend JS now lives as an actual file at
`server/assets/proposal-template.docx`, served statically at
`/assets/proposal-template.docx`. The frontend still builds the final
document client-side (JSZip splices in the customer name and hamper photos)
— it just fetches the template instead of decoding it from a JS constant —
then uploads the result to be persisted.

## API shape

Every mutating endpoint (`POST`/`PUT`/`DELETE`) responds with the full,
fresh collection for that resource, so the frontend can just assign the
response onto its in-memory `State` and re-render — the same pattern the
original `window.storage`-based app used internally. `GET /api/bootstrap`
loads everything in one round trip on startup.

Order fulfilment (`Proposal → Confirmed → Packing → Packed → Shipped →
Closed`) and its stock deduction/restoration are handled by
`POST /api/orders/:id/move`, in one DB transaction — this used to be a
read-modify-write against a local array.

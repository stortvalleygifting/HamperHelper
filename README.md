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
cp .env.example .env   # fill in DATABASE_URL
npm run migrate -- --seed   # creates tables + default packaging/shipping options
npm start                   # serves the API and the frontend on $PORT (default 3000)
```

Then open `http://localhost:3000`.

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

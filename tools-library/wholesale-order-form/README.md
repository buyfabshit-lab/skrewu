# Wholesale Order Form

**One-line pitch:** A shop-facing drop-off form — a customer's wholesale buyers
submit multi-item print/merch orders (sizes, artwork, notes) straight into your
production queue.

Portable tool module. One folder = one deployable tool, no host-site dependencies.

```
wholesale-order-form/
├── index.html     # the form (self-contained markup + CSS + display font)
├── app.js         # line-item builder, validation, artwork upload, submit
├── config.json    # per-customer branding + backend (swap this)
└── README.md      # this file
```

## What it does

A buyer fills in who they are (shop name + email), then adds one or more line
items — each with product, garment color, description, print locations, ink
method, a per-size quantity grid (XS–3XL + OS), artwork upload, and notes. Live
item/piece totals update in a sticky bar; client-side validation blocks an empty
or incomplete submission. On submit, artwork uploads to a storage bucket and the
order is written as one row, then the buyer gets a human-friendly reference
(e.g. `SU-7K3F9`) and a confirmation screen.

## Deploy

1. Copy this folder to any static host.
2. Edit `config.json` — set `backend.supabaseUrl`, `supabaseAnonKey`, `table`,
   and `artworkBucket`; set branding.
3. Provision the table + bucket in that Supabase project (schema below).
4. Open `index.html`.

Config resolves from `config.json` (same folder) or `?config=<url>`, falling back
to the built-in `DEFAULT_CONFIG` in `app.js` so it always renders.

## Config options (`config.json`)

| key | type | purpose |
|---|---|---|
| `branding.businessName` | string | Shown as the header wordmark |
| `branding.productName` | string | Document title suffix |
| `branding.tagline` | string | Sub-line + top-tag text |
| `branding.colors.accent` | hex | Primary accent (maps to `--rust`) |
| `branding.colors.accent2` | hex | Bright accent / hover (`--rust-bright`) |
| `branding.colors.highlight` | hex | Highlight / focus color (`--acid`) |
| `backend.supabaseUrl` | url | Supabase project URL |
| `backend.supabaseAnonKey` | string | Publishable/anon key (browser-safe) |
| `backend.table` | string | Orders table name |
| `backend.artworkBucket` | string | Storage bucket for uploaded artwork |
| `orderRefPrefix` | string | Prefix for the generated order reference |

## Backing table + bucket

`backend.table` (default `shop_orders`) — one row per order, line items as JSON:

`id uuid pk`, `order_ref text unique`, `shop_name text`, `contact_name text`,
`email text`, `phone text`, `rush boolean`, `needed_by date`, `items jsonb`,
`item_count int`, `qty_total int`, `notes text`, `status text`, `created_at timestamptz`.

Each `items[]` entry: `{product, color, description, print_locations, method,
sizes:{S,M,…}, qty, notes, artwork_url, artwork_name}`.

`backend.artworkBucket` (default `order-artwork`) — public-read bucket; artwork is
keyed `order_ref/item-N-timestamp-filename`.

RLS: needs **anon insert** (buyers submit with the publishable key); keep **no
public read** so order contact data stays service-role only.

## API surface (for serving via the MidnightFusion API later)

| operation | HTTP (proposed) | input | output |
|---|---|---|---|
| Submit order | `POST /v1/wholesale-orders` | `{shop_name, email, contact_name?, phone?, rush?, needed_by?, items[], notes?}` | `{order_ref, id}` |
| Upload artwork | `POST /v1/wholesale-orders/artwork` (multipart) | file | `{url, name}` |
| List orders (staff) | `GET /v1/wholesale-orders` | filters | `Order[]` |
| Get order (staff) | `GET /v1/wholesale-orders/:ref` | — | `Order` |

`Order` = the table row shape above. The browser build generates `order_ref`
client-side; an API build would generate it server-side and return it.

## Config for a specific customer

Create `/customer-packages/<name>/config.json` and point the form at it with
`?config=` rather than editing this module's defaults.

# OmniFlow Command

**One-line pitch:** A unified, multi-channel order-intake console — every order
from every sales channel in one live feed, classified and pushed to fulfillment
from a single screen.

Portable tool module. One folder = one deployable tool. No dependencies on any
host site — drop the folder on any static host, point `config.json` at a Supabase
project, and it runs.

```
omniflow-command/
├── index.html     # the tool (self-contained markup + CSS)
├── app.js         # feed, filters, classification, validate-and-push
├── config.json    # per-customer branding + backend (this file is what you swap)
└── README.md      # this file
```

## What it does

Orders flowing in from multiple channels (Shopify, Amazon, eBay, Direct API,
Manual — configurable) land in one **Integrated Order Feed** under a single
**Unified Control #**. For each order the operator can:

- Search / filter by channel, status, and date; sort any column
- Set an inline **Classification** (e.g. B2B Wholesale / DTC Standard / Expedited / Requires Review)
- Open the **Intake & Classification panel** — inspect the channel's raw payload,
  confirm standardized shipping/billing, add/remove tag chips, leave notes
- **Reject / Flag**, **Save & Hold**, or **Validate & Push to Fulfillment**

Live stats (today's intake / pending classification / flagged) compute from the feed.

## Deploy

1. Copy this folder to any static host (Netlify, Vercel, S3, GitHub Pages, an
   nginx dir — anything that serves files).
2. Edit `config.json` (see below) — at minimum set `backend.supabaseUrl`,
   `backend.supabaseAnonKey`, and `backend.table`.
3. Provision the backing table in that Supabase project (schema below).
4. Open `index.html`.

**Alternate config source:** the tool loads `config.json` from its own folder by
default, or from a URL via `?config=<url>` — e.g.
`index.html?config=/customer-packages/oceanaire/config.json`. This lets one hosted
copy of the tool serve many customers by pointing at their config. If no config is
reachable, it falls back to the built-in `DEFAULT_CONFIG` in `app.js` so it always
renders.

## Config options (`config.json`)

| key | type | purpose |
|---|---|---|
| `branding.businessName` | string | Customer/business name (alt text, labels) |
| `branding.productName` | string | Shown as the logo wordmark + document title |
| `branding.tagline` | string | Small text next to the live indicator |
| `branding.logoUrl` | string \| null | If set, replaces the gradient orb with the image |
| `branding.colors.accent` | hex | Primary accent (links, active states, control #) |
| `branding.colors.accent2` | hex | Button / hover accent |
| `branding.colors.positive` | hex | "Validate & push" / processed color |
| `backend.supabaseUrl` | url | Supabase project URL |
| `backend.supabaseAnonKey` | string | Publishable/anon key (browser-safe) |
| `backend.table` | string | Orders table name |
| `channels` | string[] | Active channels (subset of `shopify, amazon, ebay, direct_api, manual`) |
| `classifications` | string[] | Classification options offered per order |

## Backing table

`backend.table` (default `omniflow_orders`) — columns:

`id uuid pk`, `uct text unique`, `source text`, `platform_order_no text`,
`intake_at timestamptz`, `customer_name/customer_location/customer_email text`,
`ship_address/billing_info/billing_info_alt text`, `skus int`, `units int`,
`total_value numeric`, `classification text`, `status text` (`pending|flagged|processed`),
`tags text[]`, `notes text`, `raw_platform_data jsonb`, `created_at/updated_at timestamptz`.

RLS: browser build needs `select`/`update` (and `insert` if channels write in).
For production, put this behind Supabase Auth and scope the policies to staff —
the console mutates order state.

## API surface (for serving via the MidnightFusion API later)

The tool currently talks straight to Supabase, but every action maps to a small,
stable set of operations. Exposing these as REST endpoints (same table behind
them) lets the tool be *served* instead of *copied* — the front-end swaps its
Supabase calls for `fetch` against these:

| operation | HTTP (proposed) | input | output |
|---|---|---|---|
| List orders | `GET /v1/orders?channel=&status=&from=&q=` | filters (query) | `Order[]` |
| Get order | `GET /v1/orders/:id` | — | `Order` |
| Update order | `PATCH /v1/orders/:id` | `{classification?, tags?, notes?, ship_address?, billing_info?, billing_info_alt?}` | `Order` |
| Flag / reject | `POST /v1/orders/:id/flag` | `{reason?}` → sets `status=flagged` | `Order` |
| Save & hold | `POST /v1/orders/:id/hold` | standardized-field patch | `Order` |
| Validate & push | `POST /v1/orders/:id/validate` | patch → sets `status=processed` | `Order` |
| Stats | `GET /v1/orders/stats?from=` | date scope | `{total, pendingClassification, flagged}` |
| Ingest (webhook) | `POST /v1/orders` | channel payload → normalized row | `Order` |

`Order` = the table row shape above. Auth: per-tenant API key mapping to a Supabase
row-scope (tenant → `table` + RLS), so one API can serve every customer package.

## Config for a specific customer

Don't edit this module's `config.json` per customer — instead create a customer
package under `/customer-packages/<name>/config.json` and point the tool at it with
`?config=`. See `/customer-packages/oceanaire/` for a worked example.

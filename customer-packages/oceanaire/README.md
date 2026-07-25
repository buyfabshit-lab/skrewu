# Customer Package — Oceanaire Sportswear

**Customer:** Oceanaire Sportswear · **Contact:** Jeff
**Tool:** [`tools-library/omniflow-command`](../../tools-library/omniflow-command/)

This package is **just Jeff's configuration** — it demonstrates how one library
tool gets branded and pointed at a customer's own data without touching the tool's
code. The tool stays in the library; this folder only carries `config.json`.

> ⚠️ Values marked `PLACEHOLDER` / `REPLACE-WITH-…` in `config.json` are examples.
> Confirm Oceanaire's real Supabase project, key, table name, and brand colors with
> Jeff before go-live.

## What Jeff gets

An **Oceanaire-branded order deck** — his Shopify, Amazon, and manual orders in one
live feed, classified with his own buckets (Team / Bulk, Retail, Rush, Needs
Review) and pushed to fulfillment from one screen.

What's customized here vs. the stock tool:

| | Stock OmniFlow Command | Oceanaire package |
|---|---|---|
| Wordmark | "OmniFlow Command" | "Oceanaire Order Deck" |
| Palette | Blue | Ocean teal / navy |
| Channels | Shopify, Amazon, eBay, Direct API, Manual | Shopify, Amazon, Manual |
| Classifications | B2B Wholesale, DTC Standard, Expedited, Requires Review | Team / Bulk, Retail, Rush, Needs Review |
| Backend | Demo Supabase | Oceanaire's own project + `orders` table |

## Deploy (two ways)

**A — Point the hosted tool at this config** (nothing duplicated):
```
https://<your-host>/tools-library/omniflow-command/index.html?config=/customer-packages/oceanaire/config.json
```
One hosted copy of the tool serves every customer; the `?config=` URL selects Jeff's.

**B — Ship Jeff a standalone folder** (fully portable, offline of this repo):
```
1. Copy tools-library/omniflow-command/  →  oceanaire-order-deck/
2. Replace its config.json with this file (customer-packages/oceanaire/config.json)
3. Fill in Jeff's real supabaseUrl / supabaseAnonKey / table
4. Provision the `orders` table in his Supabase project (see the tool README's schema)
5. Host the folder anywhere static; open index.html
```

## Backend setup for Jeff

The tool expects the `omniflow_orders` column shape (see
[the tool README](../../tools-library/omniflow-command/README.md#backing-table)).
Create the same table as `orders` in Oceanaire's Supabase project, enable RLS, and
(for production) put it behind Supabase Auth scoped to Oceanaire staff. Real orders
arrive by inserting normalized rows from his channel integrations (Shopify/Amazon
webhooks → `orders`), or later via the MidnightFusion ingest endpoint.

## When the MidnightFusion API is live

Instead of shipping a copy, Jeff's deck will point at the hosted API with an
Oceanaire tenant key — same `config.json`, but `backend` becomes an API base URL +
key rather than a Supabase project. The tool's API surface is documented in the
[tool README](../../tools-library/omniflow-command/README.md#api-surface-for-serving-via-the-midnightfusion-api-later).

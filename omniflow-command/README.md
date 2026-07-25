# OmniFlow Command — Order Intake Console

A unified, multi-channel **order intake & classification dashboard**. Orders flowing
in from several shops/platforms (Shopify, Amazon, eBay, Direct API, Manual) land in
one live feed under a single **Unified Control #**, where an operator inspects the
raw platform payload, confirms the standardized fields, classifies each order, and
**validates & pushes it to fulfillment**.

Built to match the "OmniFlow Command" reference. Self-contained (`index.html` +
`app.js`), backed by the project's existing Supabase.

```
omniflow-command/
├── index.html   # Command bar, stats strip, order feed table, intake panel
├── app.js       # Fetch/filter/sort feed, classification + validate-and-push
└── README.md    # This file
```

## Features

- **Command bar** — global search (order #, customer, SKU, raw payload), Date Range,
  Platforms multi-select, Status filter, and **Sync Now** (re-pulls the feed).
- **Stats strip** — Today's Intake, Pending Classification, Flagged Issues, computed live.
- **Integrated Order Feed** — sortable table: status dot, source badge, intake
  time/date, platform order #, Unified Control #, customer info, Items/Qty, total
  value, an inline **Classification** dropdown, and a View action.
- **Intake & Classification Panel** — per-order detail:
  - **Raw Platform Data** (the channel's native JSON payload)
  - **Standardized Fields** — editable shipping + billing
  - **Internal Classification** — removable tag chips + quick-add + notes
  - Actions: **Reject / Flag Issue**, **Save & Hold**, **Validate & Push to Fulfillment**
- Every change persists to Supabase (optimistic update with rollback on error) and
  surfaces a toast.

## Backend (Supabase)

Same project as the main site — `qmztuagvxopahowexrum`. Migration
`omniflow_orders_intake` creates:

### Table: `public.omniflow_orders`

| column | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `uct` | text | unique — **Unified Control #** (e.g. `UCT-882912`) |
| `source` | text | `shopify` \| `amazon` \| `ebay` \| `direct_api` \| `manual` |
| `platform_order_no` | text | native channel order id |
| `intake_at` | timestamptz | when it hit the feed |
| `customer_name` / `customer_location` / `customer_email` | text | |
| `ship_address` / `billing_info` / `billing_info_alt` | text | standardized fields |
| `skus` / `units` | integer | distinct SKUs / total units |
| `total_value` | numeric | |
| `classification` | text | `B2B Wholesale` \| `DTC Standard` \| `Expedited` \| `Requires Review` |
| `status` | text | `pending` \| `flagged` \| `processed` |
| `tags` | text[] | internal classification chips |
| `notes` | text | |
| `raw_platform_data` | jsonb | the channel's native payload |
| `created_at` / `updated_at` | timestamptz | `updated_at` auto-touched by trigger |

Seeded with ~24 sample orders across all five channels so the console is populated
out of the box.

### Row-Level Security

Read / insert / update are open to `public` so the dashboard works with the browser
**publishable** key — matching this project's existing tables.

> ⚠️ **Production note:** this is an internal ops console that *mutates* order state.
> Before real use, put it behind **Supabase Auth** and tighten these policies to
> authenticated staff (e.g. `to authenticated` + a role check). The publishable key
> is safe to expose, but open write policies are not appropriate for live data.

## Ingesting real orders

The feed simply reads `omniflow_orders`. To wire real channels, insert rows from
your integration layer (Shopify/Amazon/eBay webhooks, an n8n flow, etc.), setting
`source`, `platform_order_no`, `raw_platform_data`, and the standardized fields;
assign a `uct`. New rows appear on the next **Sync Now** / reload.

## Deploying

Static files — deploy the `omniflow-command/` folder to any host. `SUPABASE_URL` /
`SUPABASE_ANON_KEY` are at the top of `app.js`.

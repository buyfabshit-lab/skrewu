# SKREW U — Multi-Shop Order Intake

A standalone drop-off form where **shops submit print/merch orders** to the SKREW U
production floor. One order per submission, with as many line items as needed —
each with product, garment color, size breakdown, print method, and artwork.

It's a self-contained mini-app (its own `index.html` + `app.js`), independent of the
main SKREW U site but sharing the same Supabase project and design system.

```
order-intake/
├── index.html   # Form UI (SKREW U design tokens + embedded display font)
├── app.js       # Line-item builder, live totals, validation, submit → Supabase
└── README.md    # This file
```

## How it works

1. A shop fills in who they are (shop name + email required), adds one or more
   line items, and drops artwork on each.
2. On submit, artwork uploads to Supabase Storage (`order-artwork` bucket), then
   the order is inserted into `public.shop_orders` as a single row with the line
   items stored as JSON.
3. The shop gets a human-friendly reference (e.g. `SU-NXBJS`) and a "we'll email a
   quote" confirmation. Nothing prints until you follow up.

## Backend (Supabase)

Same project as the main site — `qmztuagvxopahowexrum`. Provisioned via migration
`shop_orders_intake`.

### Table: `public.shop_orders`

| column | type | notes |
|---|---|---|
| `id` | uuid | pk, default `gen_random_uuid()` |
| `order_ref` | text | unique, client-generated (`SU-XXXXX`) |
| `shop_name` | text | **required** |
| `contact_name` | text | |
| `email` | text | **required** |
| `phone` | text | |
| `rush` | boolean | default `false` |
| `needed_by` | date | nullable |
| `items` | jsonb | array of line items (see below) |
| `item_count` | integer | number of line items |
| `qty_total` | integer | total pieces across all items |
| `notes` | text | order-level notes |
| `status` | text | `new` → `reviewing` → `quoted` → `in_production` → `shipped` → `done` / `cancelled` |
| `created_at` | timestamptz | default `now()` |

Each entry in `items` looks like:

```json
{
  "product": "Hoodie / Pullover",
  "color": "Black",
  "description": "Death Corps front, 4-color",
  "print_locations": "Front + back",
  "method": "Screen Print",
  "sizes": { "M": 12, "L": 18, "XL": 6 },
  "qty": 36,
  "notes": "",
  "artwork_url": "https://…/order-artwork/SU-NXBJS/item-1-….png",
  "artwork_name": "art.png"
}
```

### Row-Level Security

- **Insert:** allowed for anyone (policy `public insert shop_orders`) so shops can
  submit with the publishable key.
- **Read:** *no* public SELECT policy — orders carry contact info, so they are
  **not** readable with the publishable key. Read them from the Supabase dashboard
  (Table editor) or any server-side/service-role client.

### Storage

- Bucket `order-artwork` (public read) holds uploaded artwork, keyed by
  `order_ref/item-N-timestamp-filename`.

## Viewing incoming orders

Newest first, in the SQL editor:

```sql
select order_ref, created_at, shop_name, email, rush, qty_total, item_count, status
from public.shop_orders
order by created_at desc;
```

Full detail incl. line items and artwork links:

```sql
select * from public.shop_orders where order_ref = 'SU-XXXXX';
```

## Deploying

Static files — deploy the `order-intake/` folder to any host (Netlify, Vercel,
GitHub Pages). To surface it from the main site, link to `order-intake/` (e.g. add
a nav link or a "For shops → place an order" button on `skrewu`).

## Config

`SUPABASE_URL` / `SUPABASE_ANON_KEY` live at the top of `app.js` (publishable key —
safe for the browser). The size list and artwork bucket are constants right below.

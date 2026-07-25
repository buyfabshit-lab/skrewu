# Tools Catalog

Every tool in the [`/tools-library`](tools-library/) — one line each. Each is a
standalone, config-driven module (one folder = one deployable tool). Details and
API surface live in each tool's README.

| Tool | One-line pitch | Status | Backing data |
|---|---|---|---|
| [omniflow-command](tools-library/omniflow-command/) | Every order from every sales channel in one live feed — classify and push to fulfillment from a single screen. | ✅ Ready | Supabase `omniflow_orders` |
| [wholesale-order-form](tools-library/wholesale-order-form/) | A shop-facing drop-off form — buyers submit multi-item print/merch orders (sizes, artwork, notes) straight into your production queue. | ✅ Ready | Supabase `shop_orders` + `order-artwork` bucket |
| gang-sheet-logo-maker | Lay out customer logos into a print-ready gang sheet for DTF/transfer runs. | ⏳ Pending source — not present in this repo | TBD |

## Notes

- **gang-sheet-logo-maker** is referenced but its code isn't in `skrewu` or
  `machine`. When you point me at the repo it lives in (I can `add_repo` it), it
  drops into `tools-library/gang-sheet-logo-maker/` following the same portability
  contract (own `config.json` + README + API surface) and this row flips to ✅.

## Customer packages

| Customer | Contact | Tool | Package |
|---|---|---|---|
| Oceanaire Sportswear | Jeff | omniflow-command | [customer-packages/oceanaire](customer-packages/oceanaire/) |

## How this fits together

- **`/tools-library`** — the house. Portable, self-contained tools.
- **The site** (this repo's `index.html`/`app.js`) — the showroom. Demos tools by
  importing from the library; never the other way around.
- **`/customer-packages`** — per-customer `config.json` + notes; one tool,
  many brandings.
- **MidnightFusion API** (roadmap) — serve tools centrally via each tool's
  documented API surface instead of copying folders.

# SKREW U — System Manual & Handoff

Everything in this system, how it fits together, and what still needs connecting.
Written to be handed to another builder (human or AI) so they can work on it
without breaking it.

**Owner:** buyfabshit-lab · **Live site:** https://skrewu.netlify.app
**Work branch:** `claude/code-review-qe18vo` (PR #7) · **Preview:** https://deploy-preview-7--skrewu.netlify.app

---

## 0. Read this first — the rules

**1. Never put a real secret in a prompt, a chat, a screenshot, a config file, or
the repo.** Secrets go in Netlify environment variables or the host's secret
store, nowhere else. Every credential in this document is a placeholder.

**2. Do not weaken the tenant wall.** The locker tables refuse the public key on
purpose (they return 403). All access goes through `netlify/functions/locker.js`,
which checks the caller's key and scopes every query to that tenant. If something
"doesn't work", the fix is never "open up the table" — it is to route the call
through the function. Partners' clients' artwork sits in this database; a leak
between two of them ends a partner relationship.

**3. Fail closed.** If a key is missing, the feature stays dark and says so. Do
not add a fallback that silently reverts to unguarded access.

**4. Products push as drafts.** Nothing publishes to a live storefront without an
explicit choice.

**5. This platform is not a shop.** Every shop on it is a tenant — DEATH CORPS
included. Nothing about one shop (its domain, its Shopify variants, its
branding) belongs in the code; it lives on that tenant's row. A hard-coded shop
is a bug, because it means somebody else's customer ends up in the wrong cart.

---

## 1. What this system is

A print shop's whole operation as software, in four stages:

```
DESIGN & PREP  →  BUILD & LIST  →  SELL  →  ORDERS & FULFILMENT
```

It serves four kinds of user, all on the same engine:

| Who | What they want |
|---|---|
| **Gang sheet operator** | One tool: pack art on a sheet, export a print file |
| **Marketing seller** | Logo in → product images out |
| **Multi-channel seller** | List everywhere, orders back in one place |
| **Workstation owner** | All of it, plus the Board to run it from |
| **Partner** (e.g. Oceanaire) | Gives *their* clients branded tools; orders route back here |

---

## 2. Repos & hosting

| Piece | Where |
|---|---|
| Site + tools | GitHub `buyfabshit-lab/skrewu` |
| Automations (n8n workflows) | GitHub `buyfabshit-lab/machine` |
| Hosting + serverless functions | Netlify project **skrewu** |
| Database, file storage, edge functions | Supabase project `qmztuagvxopahowexrum` (us-west-2) |
| A storefront (DEATH CORPS') | Shopify — `deathcorps.shop` (admin domain `cae949-fc.myshopify.com`) |
| Art backup | Google Drive — folder **SKREW U — Art** |

Static site, no build step. Serverless functions live in `netlify/functions/`
and are reachable at `/api/<name>` (see `netlify.toml`).

---

## 3. The tools

### Front doors
| Page | What it is |
|---|---|
| `index.html` | SKREW U community site (shop floor, Weeklygram, zine, live) |
| `hub.html` | The Machine — control centre, links every tool in work order |
| `board.html` | The Board — production line as draggable nodes; open a node to see the real tool with a glowing marker on each button, wire each button to the service that runs it, with prompt + cost |
| `store.html` | Sells the tools (`products.json`) and the art packs (`packs.json`) |

### Design & prep
| Tool | Path |
|---|---|
| Client Locker | `locker.html?who=<slug>&k=<access key>` |
| Shirts Studio | inside `locker.html` — logo on a real blank photo, drag/size the print |
| Gang Sheet Builder | inside `locker.html` — pack a 22"/24" sheet, export 300 DPI PNG |
| UV Sticker Sheets | `sticker.html?shop=<slug>` — the customer lays out their own sheet, drags each sticker where they want it, exports 300 DPI. Works with no account; a locker link (`?who=&k=`) adds their saved logos to the tray. **Which shop it sells for comes from `?shop=`**, never from the code — sizes come from `SHEETS` in `sticker.js`, prices and Shopify variant IDs from that tenant's `shop.sheets`. **Order this sheet** renders the print file, puts it in the `listing-photos` bucket, and hands off to that shop's `/cart/add` with the file attached as a line-item property, so Shopify takes the money and the order arrives with the artwork on it. With no shop, or a size the shop hasn't listed, the order button is hidden and export still works. Keep each variant's price on Shopify in step with `shop.sheets`. For DEATH CORPS the *Custom UV Sticker Sheet* product must be set Active — while it's a draft the cart link 404s. |
| Logo Maker | `tools-library/gang-sheet-logo-maker/` — background cut, enhance, vectorize |
| Logo Vault | `tools-library/logo-vault/` — licensed art catalogue |

### Build, list & sell
| Tool | Path |
|---|---|
| Deploy Panel | `deploy.html` — one button pushes a product to sales channels |
| Blanks Catalog | `tools-library/blanks-storefront/` — live S&S Activewear feed (needs keys; falls back to a demo list) |

### Orders & fulfilment
| Tool | Path |
|---|---|
| OmniFlow Command | `tools-library/omniflow-command/` — every channel's orders in one console |
| Wholesale Order Form | `tools-library/wholesale-order-form/` — B2B multi-item drop-off |
| Ship Manifest | `order-manifest.html` — pull & pack sheet |
| Customer Tracking | `order-confirmation.html` — what the buyer sees |
| Print Ticket + CAD | `ticket.js` (NEVER BLANK) |

> **Note on names:** OmniFlow Command, NEVER BLANK and the rest are **custom software
> built in this repo** — not third-party products or subscriptions. The names were
> invented here. Nothing external needs licensing.

---

## 4. Database (Supabase `qmztuagvxopahowexrum`)

### Tenants and lockers — **locked down**
| Table | Holds |
|---|---|
| `tenants` | slug, name, `parent_slug`, `kind` (owner/partner/client), `access_key`, branding, tools, `shop`, active |
| `locker_logos` | a tenant's logos (`tenant_slug`, name, url, storage_path, drive_file_id) |
| `locker_shirts` | saved shirts (logo, base photo, print position, price, status) |
| `locker_garments` | uploaded blank photos used as mockup bases |
| `locker_gang_sheets` | saved gang sheet layouts |

The four `locker_*` tables **deny the public key** (403). Reachable only through
the locker function using the service role key.

`tenants.shop` is that tenant's storefront — public, non-secret config:

```jsonc
{ "domain": "deathcorps.shop",
  "theme": "skrewu",
  "sheets": { "ltr": { "variant": "45551940698198", "price": 18 } } }
```

Today: `skrewu` is the owner (the platform), `deathcorps` and `rorion` are
clients, `oceanaire` is a partner. DEATH CORPS is a customer of this system,
not the system.

### Everything else (used by the live site, unchanged)
`listings`, `bids`, `pins`, `pin_replies`, `join_requests`, `designs`,
`vault_assets`, `shop_orders`, `omniflow_orders` (24 live rows), plus the
`ms_*` tables from a separate project.

### Storage buckets
`listing-photos` (logos, mockups, gang sheets — namespaced `locker/<slug>/…`),
`pin-media`, `site-assets`, `zine-images`, `vault-originals` (private),
`vault-public`.

---

## 5. The tenant model — how access works

```
owner (skrewu)
 ├── partner (oceanaire)      ← gives their own clients tools
 │      └── client, client…
 └── client (rorion)
```

Each tenant has an **access key**. A person's link carries it:

```
locker.html?who=<slug>&k=<access key>
```

The link *is* the credential — no login, but it only opens that one locker.
Keys live in `tenants.access_key`. Retrieve or rotate them with SQL; never
publish one.

### The only door: `POST /api/locker`

```jsonc
{ "action": "...", "who": "<slug>", "key": "<access key>", ... }
```

| action | body | returns |
|---|---|---|
| `whoami` | — | name, branding, tools; for a partner also **their own** client list |
| `list` | `{ table }` | that tenant's rows |
| `insert` | `{ table, row }` | new row (tenant stamped server-side) |
| `update` | `{ table, id, patch }` | updated row — only if it belongs to the tenant |
| `remove` | `{ table, id }` | deleted row — same rule |

`table` is one of `logos` · `shirts` · `garments` · `gangsheets`.

Guarantees, do not remove:
- wrong or missing key → **401**, unknown slug → **404**
- every query filtered by `tenant_slug`; **no request shape returns another tenant's rows**
- `tenant_slug` / `owner_slug` / `id` / `created_at` are stripped from anything a caller sends
- a partner's `whoami` returns only tenants whose `parent_slug` is that partner

---

## 6. Connections — what to set, and where

All of these are **Netlify → Site configuration → Environment variables**.
Values below are placeholders.

### Required for lockers to work at all
| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://qmztuagvxopahowexrum.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `REPLACE_WITH_SUPABASE_SERVICE_ROLE_SECRET` — Supabase → Project Settings → API → `service_role`. Server-side only. |

### Shopify (turns on Push to shop + Deploy Panel)
| Variable | Value |
|---|---|
| `SHOPIFY_STORE_DOMAIN` | `cae949-fc.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | `REPLACE_WITH_SHOPIFY_ADMIN_TOKEN` (`shpat_…`) |
| `SHOPIFY_API_VERSION` | optional, defaults `2024-10` |
| `SHOPIFY_WEBHOOK_SECRET` | `REPLACE_WITH_SHOPIFY_WEBHOOK_SECRET` — shown when you create the `orders/create` webhook. Without it `/api/shopify-order` refuses every call, which is correct: an unsigned order endpoint lets anyone write into your order list. |

**Turning on live order intake:** Shopify admin → Settings → Notifications →
Webhooks → Create webhook → event **Order creation**, format **JSON**, URL
`https://skrewu.netlify.app/api/shopify-order`. Copy the signing secret it
shows into `SHOPIFY_WEBHOOK_SECRET`. Every paid order then lands in OmniFlow
within seconds, with any customer-designed print file attached to it.

Create the token: Shopify admin → Settings → Apps and sales channels → Develop
apps → Create an app → scopes `write_products`, `read_products` → Install →
reveal token once.

### Store checkout (Stripe)
Either paste a **Stripe Payment Link** per product into `products.json`
(no backend), **or**:

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `REPLACE_WITH_STRIPE_SECRET_KEY` |
| `SITE_URL` | optional, where buyers return after paying |

### Optional
| Variable | For |
|---|---|
| `ANTHROPIC_API_KEY` | AI product descriptions (otherwise a template is used) |
| `DEPLOY_SHARED_KEY` | password-gates the deploy endpoint |
| `SS_ACCOUNT_NUMBER`, `SS_API_KEY` | S&S Activewear blanks catalogue (function in `tools-library/blanks-storefront/functions/ss-products/`) |

### Not on Netlify
| Thing | Where it goes |
|---|---|
| Google Drive | a Google Drive OAuth credential inside **n8n**, on the *Upload to Drive* node of `workflows/art-to-drive-sync.json` (repo `machine`) |
| TikTok Shop | App key + secret from **partner.tiktokshop.com** (the Shop side, *not* developers.tiktok.com). Token exchange `grant_type` must be the exact string `authorized_code`. Access token goes in the `x-tts-access-token` header; every call is HMAC-SHA256 signed. |
| eBay | developer.ebay.com keyset (App ID / Cert ID / Dev ID) — not started |

---

## 7. Serverless functions

| Function | Endpoint | Needs |
|---|---|---|
| `locker.js` | `/api/locker` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `shop.js` | `/api/shop?shop=<slug>` | same — returns only a tenant's **public** shop config (name, accent, domain, sheet variants). Deliberately a separate function from the locker so the locker's rule stays absolute: no key, no data. The select names its columns, so nothing secret can leak through it. |
| `deploy-shopify.js` | `/api/deploy-shopify` | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN` |
| `shopify-order.js` | `/api/shopify-order` | `SHOPIFY_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Shopify's `orders/create` webhook. Verifies the HMAC, then upserts into `omniflow_orders` keyed on `uct` (`UCT-SH-<shopify id>`), so redelivery can't duplicate an order. Pulls print files out of line-item properties into the order's notes. |
| `generate-description.js` | `/api/generate-description` | `ANTHROPIC_API_KEY` (optional) |
| `checkout.js` | `/api/checkout` | `STRIPE_SECRET_KEY` — prices come from `products.json` + `packs.json` in the repo, never from the browser |

Supabase edge functions `vault-list` / `vault-sign` / `vault-upload` are
committed but **not deployed** — deploy from the Supabase dashboard when the
vault is needed.

---

## 8. State of play

**Working now:** lockers, shirts studio, gang sheet export, the Board, the hub,
the store front-end, OmniFlow (24 real orders), wholesale form, ship manifest,
customer tracking, tenant wall.

**Built, waiting on a key:** Shopify push · live order intake (the
`orders/create` webhook above) · Stripe checkout · Google Drive backup ·
S&S blanks catalogue.

**How an order flows now:** customer builds a sticker sheet → print file goes to
storage → Shopify cart → they pay → `orders/create` fires → `/api/shopify-order`
verifies and files it → OmniFlow → Ship Manifest → Customer Tracking. Every
channel is meant to land in `omniflow_orders` the same way; Shopify is the first
one wired end to end.

**Not started:** TikTok Shop (needs partner approval) · eBay · partner console
for Jeff · order routing with partner attribution · true white-label (no SKREW U
branding on a partner's client screens).

**Known gaps worth naming**
- `packs.json` ships empty. The store section and the sticker builder's art tray
  both read it, so a pack becomes sellable *and* usable the moment its entry and
  art URLs go in — no code change.
- Multi-channel listing needs retries and a visible failure log before it is sold
  to anyone — a listing that silently fails to post loses a customer that week.
- The sticker builder can't save a sheet built from a file you just uploaded from
  your phone — that art exists nowhere but the browser tab. It says so instead of
  half-saving. Uploading through the locker first fixes it.
- `people.json` is legacy; tenants are the source of truth now.

---

## 9. If you are picking this up

1. Read section 0 again.
2. Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, confirm a locker loads.
3. Work on branch `claude/code-review-qe18vo`; Netlify builds a preview per push.
4. Adding a tool = one folder under `tools-library/` + one entry in `TOOLS` in
   `board.js`. Buttons with `data-id` and readable text are discovered
   automatically by the Board.
5. Adding a person = one row in `tenants` (set `parent_slug` for a partner's
   client) + hand them `locker.html?who=<slug>&k=<their key>`.

---

## 10. Four faces, one engine

Same tools, same wiring, same database — only the palette, the type and the
words change. `themes.json` holds them; `theme.js` applies them.

| id | Called | For |
|---|---|---|
| `skrewu` | SKREW U | our own people — underground, shop floor |
| `pro` | Studio | corporate and professional accounts |
| `sport` | Team | schools, clubs, teams |
| `tropical` | Island | Hawaiian and island shops, surf, resort wear |
| `critters` | Critters | pet and people shops |

**SKREW U is one face, not the product.** No page owns the brand: every place it
appears is a `data-brand` element that `theme.js` fills in, and the tab title
comes from `data-page` on the body plus the face's name. Rorion and Oceanaire
are set to `pro`; nobody is handed somebody else's brand.

**A real presenter, per face.** Add `"video"` (and optionally `"poster"`) to a
face and the intro plays that instead of the drawn one — filmed or generated.
The same lines still type underneath, so it works with the sound off and reads
the same if the video never loads. A face with a video hides the "say it out
loud" button, since her voice is already on the tape.

Each carries its own intro script, so the guide says the same six true things
in the right voice for whoever's listening.

Which face, in order: `?theme=<id>` → the shop's `shop.theme` → whatever they
picked last on this device → the default in `themes.json`. A pinned `?theme=`
is carried onto same-site links, so nobody looking at the corporate face gets
thrown back into ours by clicking through.

**Adding a fifth is a block in `themes.json` — no code.** Adding a *tool*
still needs `board.js`. Keep it that way: skins are content, tools are code.

---

## 11. Streaming — the live overlay

`live.html?shop=<slug>&k=<access key>` — add as a **browser source** in OBS or
TikTok LIVE Studio. Transparent background; only the panels show. Orders appear
on screen as they're paid, because the Shopify webhook has already filed them
by then.

`&bg=1` paints a solid background for setting it up · `&show=tally,feed,drop`
picks the panels · `&every=<seconds>` sets how often it checks (10 by default,
5 at the fastest).

Fed by `/api/live`, which is guarded on two points that must not be relaxed:

- **It needs the shop's access key.** An overlay URL lives in streaming
  software, but URLs leak — pasted into a chat, caught in a screen recording.
- **It returns a first name and a city. Nothing else.** No surname, email,
  street or phone. This data is going on a public livestream and the buyer
  never agreed to that. If a field isn't on that list, it doesn't leave the
  database.

The overlay also stays silent when something's wrong — a bad key or a dropped
connection shows nothing over a live stream, and explains itself only under
`&bg=1`. An error message in front of an audience is worse than a blank corner.

### The backdrop — the layer behind you

`backdrop.html?theme=<id>` (or `?shop=<slug>`) — a browser source that goes
*under* your camera, where the overlay goes over it. Each face brings its own
look: `blobs`, `stripes`, `grid` or `plain`, set per face in `themes.json`.

`&style=` · `&words=center|corner|off` · `&name=` `&sub=` to override the
wording · `&still=1` to stop all motion.

Nothing animates in JavaScript. The machine is already encoding video, so the
movement is CSS on transform and opacity only and the compositor carries it.
Keep it that way — an animation loop competing with an encoder drops frames.

### Saved setups

The Board's **Setups** button keeps an arrangement you like and loads it back
later; they live on the device next to the board itself. A setup stores the
blocks and the hand-offs, never the wiring — so loading one rearranges the line
without touching the services, prompts and rates you set up.

**Reset line** follows the same rule: it puts the blocks back and keeps your
wiring. Arranging is layout; wiring is work, and the two shouldn't share a
delete button.

**Not yet:** a QR code on the drop panel. Worth doing — a QR converts a viewer
faster than a typed URL — but it needs a real encoder written in, and a wrong
one is worse than none.

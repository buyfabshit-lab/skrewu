# Where we left off — 22 Aug 2026

Written at the end of a session so nothing has to be remembered. Read this
first; it says what is done, what is waiting on Justin, and what was decided
but not yet built.

---

## 1. Three sites now, not one

skrewu.com used to publish the whole repo root, which put every tool and every
`/api/*` function on the open web. It is now split, and which directory a file
sits in decides who can reach it.

| Netlify project | Base directory | Password | What it serves |
|---|---|---|---|
| `skrewu` → skrewu.com | *(repo root)* | no | `public/` — the community front, nothing else |
| `skrewu-tools` | `internal` | **yes** | all 21 tool pages + 16 functions |
| `skrewu-webhooks` | `webhooks` | **no, deliberately** | only `stripe-order` + `shopify-order` |

**skrewu.com is done and verified.** Netlify's production deploy record for the
live commit reports "No functions deployed" and "No redirect rules processed",
and CI asserts on every push that `public/` holds only `index.html`, `app.js`
and `_headers` and that the page links to no `.html` and no `/api` route.

The webhook site has no password on purpose: Netlify's visitor password gates a
whole site including functions, and Stripe and Shopify are machines that cannot
type one. Both receivers verify an HMAC signature and fail closed without their
secret, so the signature — not the password — is what protects them.

### Waiting on Justin (cannot be done from an API)

1. **Link `skrewu-tools`** to this repo, base directory `internal`.
2. **Link `skrewu-webhooks`** to this repo, base directory `webhooks`.

Until then the tools are off the public web but not yet live anywhere, and the
receivers are not deployed. Both sites already have `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` set. Both builds were dry-run locally and bundle
clean through esbuild for node18.

---

## 2. Secrets still missing

`STRIPE_WEBHOOK_SECRET` is the one that costs money. Without it `stripe-order`
refuses every callback, so **a card can be charged and the sale is recorded
nowhere** — including credit top-ups, which take payment and grant nothing.
Stripe mints it when you create the endpoint: Developers → Webhooks → add
endpoint at `/api/stripe-order`, event `checkout.session.completed`, on the
**webhooks** site. `SHOPIFY_WEBHOOK_SECRET` is the same story for Shopify.

Eleven other secrets are absent and keep their tools dark: `FAL_KEY` (AI image
and video), `ANTHROPIC_API_KEY` (product copy), `SS_ACCOUNT_NUMBER` + `SS_API_KEY`
(blanks), the three Shopify vars + `DEPLOY_SHARED_KEY` (deploy panel), and the
two TikTok keys. Buying a tool does *not* depend on any of them — all six
products carry Stripe Payment Links, so `store.html` never calls the API.

`serv`, a second full copy of the Supabase service-role key that nothing read,
has been deleted.

---

## 3. Decided, not yet built

Two answers given at the end of the session. Nothing has been written for
either — this is the starting point, not a progress report.

### The shop: build it on skrewu, Stripe checkout

The Shop button in the nav points at `midvault-cidg2ahn.manus.space`, and Manus
is shutting down. The decision is to rebuild on our own infrastructure and sell
through Stripe Payment Links — the same mechanism already working for the six
tools, which needs neither Shopify nor `STRIPE_SECRET_KEY`.

Two things to sort before starting:

- **What did the Manus shop sell?** It could not be reached from the build
  environment, so someone has to export it or describe it before it can be
  matched. If anything exists only on Manus, get it off before the shutdown.
- **The footer Shop link points somewhere else** — `shop.skrewu.com`, not the
  Manus URL. One of the two is already wrong; find out which.

Worth knowing: **Shopify is not currently usable.** `get-shop-info` returns
"This shop is unavailable for API access — the merchant may need to resolve a
billing issue or upgrade their plan." So `deathcorps.shop`, which `hub.html`
calls the live store and which the deploy panel pushes to, is off the table
until that account is sorted.

### Posting designs from the tools: both, chosen per post — **BUILT**

Build a shirt in the locker, press **Post to SKREWU**, choose auction or fixed
price. It lands in the Customs grid on skrewu.com.

No new table was needed. `listings` already carried `start_price` and
`buy_now_price` side by side, so both shapes come out of the table the board
already uses: an auction sets the start and leaves buy-now empty; a fixed price
sets both to the same number, so bidding can never get anywhere and Buy Now is
the only move. The insert runs server-side (`post_to_site` in
`netlify/functions/locker.js`) because only the server can check the shirt
belongs to that locker before putting its owner's name on a listing.
`locker_shirts.listing_id` records where it went so nothing posts twice.

Two older bugs were fixed on the way. `place_bid` never treated buy-now as a
ceiling — on any auction you could bid past it and owe more than the seller had
offered to end it for — and the detail panel invited a bid on fixed-price rows.
Both now refuse, the database first.

**Still not done: taking the money.** The board has never had checkout — Buy Now
just marks the listing claimed, and payment happens off-platform. Real checkout
needs `STRIPE_SECRET_KEY`, because per-item Payment Links can't be pre-made for
shirts people post themselves. That is the next piece, and it is shared with the
shop below.

---

## 4. Loose ends

- **The logo vault is empty.** `vault_assets` has 0 rows and the three vault
  buckets hold 0 files. `MidnightFusion_Logo_Vault_MVP.zip` (4.1 MB, 21 July) is
  in Google Drive and holds the real tiers, the nine products and the artwork;
  the download needs an approval that was never granted. `tools-library/logo-vault/config.json`
  is still placeholder, and its `assetBucket` says `print-assets` while the
  buckets built for it are `vault-originals` and `vault-public` — left alone
  rather than guessed at.
- **`tools-library/` is in this repo**, not in `buyfabshit-lab/machine`.
  `machine` is Midnight Fusion, a separate homepage project. The library is the
  master copy every customer package is cut from, like
  `customer-packages/oceanaire`, and is published by no site.

# Logo Vault

**One-line pitch:** Sell licensed brand art with tiered licensing — watermarked
previews, clean files delivered only after purchase.

Portable tool module (MidnightFusion). One folder = one deployable storefront.
Catalog, license tiers, checkout, and secure delivery are all config-driven.

```
logo-vault/
├── index.html     # gallery + license/checkout + redeem-download modals
├── app.js         # config, catalog render, Shopify checkout, signed-URL delivery
├── config.json    # branding + backend + shopify + tiers + catalog (the swap point)
└── README.md      # this file
```

> ⚠️ **Placeholder data.** The `MidnightFusion_Logo_Vault_MVP.zip` did not reach
> the build environment, so the 9 products and exact tier pricing/terms in
> `config.json` are stand-ins. Replace the `tiers` + `catalog` blocks verbatim with
> the MVP's values — no code changes needed.

## What it does

- Shows a gallery of catalog pieces. Every preview is **watermarked** (a public,
  low-res/watermarked `previewUrl` plus a CSS watermark overlay) — the clean,
  unwatermarked master **never enters the page**.
- Each piece offers the configured license tiers (Creator / Commercial / Extended)
  with prices. Picking one opens the license modal.
- **Checkout** creates a Shopify cart via the Storefront API and redirects the
  buyer to Shopify's hosted checkout.
- After purchase, **Redeem a download** exchanges the order reference for a
  short-lived **Supabase signed URL** to the clean master in the private
  `print-assets` bucket.

## Deploy

1. Copy this folder to any static host.
2. Fill `config.json`:
   - `shopify.storefrontDomain` + `storefrontAccessToken`, and a Shopify
     **variant id** per product per tier (`catalog[].variants.{creator,commercial,extended}`).
   - `backend.supabaseUrl` / `supabaseAnonKey`, `assetBucket` (`print-assets`),
     and — for production — `signerEndpoint` (see security model).
   - `tiers` + `catalog` from the MVP.
3. In Supabase: create a **private** `print-assets` bucket and upload each piece's
   clean master at its `assetPath`. Put the watermarked previews on a **public**
   URL (`previewUrl`).
4. In Shopify: create a product + 3 tier variants per piece; paste the variant
   GIDs into config. (Digital delivery is handled here, not by Shopify.)
5. Open `index.html`.

Config resolves from `config.json` (same folder) or `?config=<url>`, with a
built-in default fallback so it always renders.

## Config options

| key | purpose |
|---|---|
| `branding.*` | Name, tagline, hero eyebrow, logo, accent + gold colors |
| `backend.supabaseUrl` / `supabaseAnonKey` | Supabase project (browser-safe key) |
| `backend.assetBucket` | Private bucket holding clean masters (default `print-assets`) |
| `backend.signerEndpoint` | URL that verifies the Shopify order and returns a signed URL (**required for production**; `null` = insecure demo signing) |
| `backend.signedUrlTtlSeconds` | Signed-URL lifetime (default 300) |
| `shopify.storefrontDomain` / `storefrontAccessToken` / `apiVersion` | Storefront API |
| `tiers[]` | `{id, name, price, currency, blurb}` — the license tiers |
| `catalog[]` | See shape below |

**Catalog item shape**
```json
{
  "id": "lv-01",
  "name": "Piece name",
  "previewUrl": "https://.../previews/lv-01.png",   // public, watermarked
  "assetPath": "lv-01/master.zip",                   // path inside print-assets (private)
  "formats": ["SVG","AI","PNG","PDF"],
  "prices": { "creator": 29, "commercial": 79, "extended": 249 },  // optional; else tier default
  "variants": {                                       // Shopify Storefront variant GIDs
    "creator":    "gid://shopify/ProductVariant/111",
    "commercial": "gid://shopify/ProductVariant/222",
    "extended":   "gid://shopify/ProductVariant/333"
  }
}
```

## Watermark & security model

- **Previews are always watermarked.** Use a watermarked `previewUrl`; the tool
  also overlays a CSS watermark. The clean master is never referenced in the page.
- **Clean files live in a private bucket** (`print-assets`) and are only reachable
  through a **signed URL** minted at redeem time, expiring in `signedUrlTtlSeconds`.
- **Entitlement must be verified server-side.** In production set
  `backend.signerEndpoint` to an endpoint (e.g. a Supabase **Edge Function**) that:
  1. receives `{orderRef, productId, tierId, assetPath, bucket}`,
  2. verifies the Shopify order is paid and contains that product/tier
     (Shopify Admin API / order webhook record),
  3. mints and returns `{signedUrl}` using the **service-role** key.
  With `signerEndpoint: null`, the tool signs directly from the browser as a
  **demo only** — that path is not order-verified and must not ship.

## API surface (for serving via the MidnightFusion API later)

| operation | HTTP (proposed) | input | output |
|---|---|---|---|
| List catalog | `GET /v1/logo-vault/catalog` | — | `{tiers[], catalog[]}` |
| Start checkout | `POST /v1/logo-vault/checkout` | `{productId, tierId}` | `{checkoutUrl}` (wraps Shopify cartCreate) |
| Order webhook | `POST /v1/logo-vault/webhook/shopify` | Shopify order payload | records entitlement |
| Signed download | `POST /v1/logo-vault/download` | `{orderRef, productId, tierId}` | `{signedUrl, expiresIn}` (verifies entitlement, signs `print-assets`) |

`signerEndpoint` in config points at the **Signed download** endpoint. Per-tenant
API keys map to a Shopify store + Supabase bucket, so one API can serve every
customer's vault.

## Configure for a customer

Create `/customer-packages/<customer>/config.json` (their branding, Shopify store,
Supabase project, catalog) and point the tool at it with `?config=`, or copy the
folder and drop their config in for a standalone hand-off.

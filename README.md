# SKREW U

> Underground · By invite, not by ad spend

A network for the ones who build their own merch, run their own feed, and broadcast straight from the floor. No gatekeepers. Some rules — enough to keep it standing.

## Live Site

[https://skrewu.netlify.app/](https://skrewu.netlify.app/)

## Project Structure

```
skrewu/
├── index.html                        # Main HTML page
├── app.js                            # Application JavaScript bundle
├── deploy.html                       # Multi-channel "deploy a product" control panel
├── deploy.js                         # Deploy panel logic
├── netlify.toml                      # Netlify config (static site + functions)
├── netlify/functions/
│   ├── deploy-shopify.js             # Server-side: create a product on Shopify
│   └── generate-description.js       # Server-side: AI/template product copy
└── README.md                         # This file
```

## Features

- **Shop** — Browse and list items for sale
- **Customs** — Custom merch section
- **Weeklygram** — Weekly community photo/video wall (powered by Supabase)
- **The Zine** — Digital zine with spreads/issues
- **Frequency** — Podcast/audio section
- **Live** — Live broadcast section
- **Get In** — Community entry request form

## Tech Stack

- Vanilla HTML/CSS/JavaScript (single-page application)
- [Supabase](https://supabase.com/) for backend (database, storage, auth)
- Hosted on [Netlify](https://netlify.com/)

## Deploy to Sales Channels (`/deploy.html`)

A control panel to **design a product once and push it out to multiple sales
channels**. Build the listing (image + name + description + price), pick your
channels, and hit **Deploy**.

- **Shopify** — ✅ live (creates a product on the DEATH CORPS store)
- **eBay** — 🔶 stubbed (needs an eBay developer keyset)
- **TikTok Shop** — 🔴 stubbed (needs approved Partner API access + seller auth)

The Admin API token lives **only** in Netlify environment variables and is used
server-side by the functions — it never reaches the browser.

### Required Netlify environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | Shopify | The `*.myshopify.com` admin domain (e.g. `deathcorps.myshopify.com`), **not** `deathcorps.shop`. |
| `SHOPIFY_ADMIN_TOKEN` | Shopify | Admin API access token (`shpat_…`) from a custom app with the `write_products` scope. |
| `SHOPIFY_API_VERSION` | Shopify | Optional. Defaults to `2024-10`. |
| `ANTHROPIC_API_KEY` | Auto-description | Optional. Without it, the "Auto-fill" button uses a built-in template. |
| `ANTHROPIC_MODEL` | Auto-description | Optional. Defaults to `claude-sonnet-5`. |
| `SUPABASE_URL` | Lockers | **Required now.** `https://qmztuagvxopahowexrum.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Lockers | **Required now.** Supabase → Project Settings → API → `service_role` secret. Server-side only — the locker function uses it to enforce who can see what. Without it the lockers won't load. |
| `STRIPE_SECRET_KEY` | Store checkout | Optional — only if you want checkout built server-side instead of pasting Stripe Payment Links into `products.json`. |
| `DEPLOY_SHARED_KEY` | Access gate | Optional but recommended. If set, the deploy function requires a matching `x-deploy-key`; enter it once in the panel (double-click the top-right tag to reveal the field). |

### How to create the Shopify token
1. Shopify admin → **Settings → Apps and sales channels → Develop apps → Create an app**.
2. **Configure Admin API scopes** → enable `write_products` (and `read_products`).
3. **Install app**, then copy the **Admin API access token** into `SHOPIFY_ADMIN_TOKEN`.

New products are created as **draft** by default (safe). Tick "Publish live
immediately" in the panel to create them as active.

### Local dev
`npm i -g netlify-cli` then `netlify dev` to run the static site + functions together.

## Deployment

This is a static site plus Netlify Functions. Deploying to Netlify picks up
`netlify.toml` automatically. For static-only hosts (Vercel/GitHub Pages), the
`index.html`/`app.js` site works on its own, but the `/deploy.html` channel push
needs the serverless functions (or an equivalent backend).

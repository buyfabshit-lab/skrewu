# Tools Library

Standalone, self-contained tool modules. **One folder = one tool** a customer can
receive, deploy, and run on its own — with **zero dependencies on the site code**.

The site is a **showroom**: it may *demo* these tools by importing them from here,
but nothing in this library depends on the site. The dependency only ever points
one way (site → library), never the reverse.

## The portability contract

Every tool in `tools-library/<tool-name>/` MUST be:

1. **Self-contained** — its own folder with everything it needs. No imports from
   the host site; external libraries only via public CDN.
2. **Config-driven** — a `config.json` carries per-customer branding (logo, colors,
   business name) and backend settings. Swapping that one file re-skins and
   re-points the tool. The tool loads `config.json` from its folder, or from a URL
   via `?config=<url>`, and falls back to a built-in default so it always runs.
3. **Documented** — a `README.md` covering: what it does, how to deploy, config
   options, the backing data shape, and the **API surface** (so the tool can later
   be *served* through the MidnightFusion API instead of copied).

```
tools-library/<tool-name>/
├── index.html     # tool entry
├── app.js         # tool logic
├── config.json    # branding + backend (the per-customer swap point)
└── README.md      # what / deploy / config / API surface
```

## Tools

See [`TOOLS-CATALOG.md`](../TOOLS-CATALOG.md) at the repo root for the one-line
pitch of each. Current modules:

- **[omniflow-command](omniflow-command/)** — unified multi-channel order-intake console.
- **[wholesale-order-form](wholesale-order-form/)** — shop-facing multi-item order drop-off form.
- **[logo-vault](logo-vault/)** — sell licensed brand art with tiered licensing (Shopify checkout + signed-URL delivery).
- **[blanks-storefront](blanks-storefront/)** — pick a blank, then design it; live S&S Activewear catalog via the bundled `ss-products` function.

## Configuring a tool for a customer

Never fork a tool per customer. Instead:

1. Create `/customer-packages/<customer>/config.json` with their branding + backend.
2. Point the tool at it: `.../<tool>/index.html?config=/customer-packages/<customer>/config.json`,
   **or** copy the tool folder and drop the customer `config.json` in for a fully
   standalone hand-off.

See [`/customer-packages/oceanaire/`](../customer-packages/oceanaire/) for a worked example.

## Roadmap: serve, don't copy

Each tool's README documents its API surface. Once those endpoints are live on the
**MidnightFusion API**, a customer package becomes a tenant key + branding rather
than a copied folder — the same front-end, served centrally.

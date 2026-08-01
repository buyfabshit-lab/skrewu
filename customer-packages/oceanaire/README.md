# Oceanaire Sportswear — Customer Package

**Customer:** Jeff · Oceanaire Sportswear
**Tool:** [Gang Sheet Logo Maker](../../tools-library/gang-sheet-logo-maker/)
**Package contents:** `config.json` (Jeff's branding) + this README.

This folder is the worked example of **how a library tool gets configured for a real
customer**. No tool code lives here — only Jeff's branding. The tool itself stays in
`/tools-library` and is never modified per-customer.

---

## Jeff's branding

| Setting | Value |
|---------|-------|
| Business name | Oceanaire Sportswear |
| Tool title | Team Logo Prep _("Prep" is accent-coloured)_ |
| Tagline | Custom Sportswear · DTF & Embroidery |
| Accent | Ocean blue `#0b5c8a` / `#1499d6` |
| Highlight (After badge, focus) | Buoy gold `#ffd23f` |
| Export filename | `oceanaire-logo-transparent.png` |
| Remove-BG | tolerance 30, maxDimension 2000 (larger sheets) |

To add Jeff's logo to the header: drop `logo.png` (or `.svg`) in this folder and set
`"logoUrl": "logo.png"` in `config.json`. Empty = title text only.

---

## Deploy for Oceanaire — pick one

### A. Copy + config (ship it today)
1. Copy `/tools-library/gang-sheet-logo-maker/` to Jeff's host
   (e.g. `oceanaire.midnightfusion.io/logo-maker/`).
2. Replace the copied `config.json` with **this** `config.json`.
3. Serve. Done — the header, colours, and export name are now Oceanaire's.

### B. Point the deployed tool at this config
Deploy the tool once and pass Jeff's config by URL:
```
/tools-library/gang-sheet-logo-maker/index.html?config=/customer-packages/oceanaire/config.json
```
Handy for the showroom to **demo Jeff's build live** without a second copy of the tool.

### C. Serve via MidnightFusion API (later)
When the tool is served through MidnightFusion, host this `config.json` at Jeff's
tenant URL and load the tool with
`?config=https://api.midnightfusion.io/v1/tenants/oceanaire/tools/gang-sheet-logo-maker/config`.
See the tool's [API surface](../../tools-library/gang-sheet-logo-maker/README.md#api-surface-for-serving-via-midnightfusion-api-later).

---

## Verify

Serve the repo root over HTTP and open route **B** above — the header should read
**“Oceanaire Sportswear — Team Logo Prep”**, the UI should be ocean-blue with a gold
“After” badge, and an exported file should be named `oceanaire-logo-transparent.png`.

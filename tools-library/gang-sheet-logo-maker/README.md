# Gang Sheet Logo Maker

A self-contained, mobile-style **logo editor for DTF / DTG / vinyl & shirt production**.
Upload a logo, clean it up (background removal today; more tools rolling in), compare
before/after, and export a print-ready PNG.

> **Zero dependencies.** One folder = one tool. Everything (markup, styles, fonts,
> logic) lives in `index.html`. Nothing here imports from the Threadline/SKREW U site
> or any CDN — drop this folder on any static host and it runs.

```
gang-sheet-logo-maker/
├── index.html     # the entire tool (self-contained)
├── config.json    # per-customer branding (edit this, not the code)
└── README.md      # you are here
```

---

## What it does

| Area | Status | Notes |
|------|--------|-------|
| Upload logo (file picker + drag/drop) | ✅ | PNG · JPG · SVG |
| Before/After compare slider | ✅ | Draggable split |
| **Remove Background** | ✅ | 100% client-side flood-fill + edge feather. No API key, no backend, no per-image cost. Best on solid/simple backgrounds; keeps interior detail. |
| **Export** | ✅ | Downloads transparent PNG (or original if untouched) |
| Undo / Reset / New | ✅ | Single-level undo of the last op |
| Enhance · HD Upscale · Vectorize · Color Fix · Sharpen · Noise Reduce · Defringe · Shadow Fix | 🔧 stub | Buttons wired to the dispatcher; fire a placeholder toast until implemented |
| DFT production tools (DTF Optimize, White Ink, Color Boost, Ink Save, Transparency) | 🔧 stub | Same — registry-driven, ready to fill in |

---

## Deploy

**Any static host** (Netlify, Vercel, S3, GitHub Pages, a folder behind nginx):

1. Copy this folder to your host.
2. Edit `config.json` with the customer's branding (see below).
3. Serve it. `index.html` fetches `./config.json` at load over HTTP.

> Opening `index.html` directly from disk (`file://`) works, but the browser
> blocks `fetch()` of `config.json`, so it falls back to the built-in defaults.
> Serve over HTTP (even `python3 -m http.server`) to see branding applied.

---

## Config surface (`config.json`)

Everything brandable, no code changes:

```json
{
  "businessName": "SKREW U",
  "toolTitle": "Logo Maker",
  "tagline": "Gang Sheet · DTF & Shirt Production",
  "logoUrl": "",
  "colors": {
    "accent": "#a32a1f",
    "accentBright": "#c43a2c",
    "accentDim": "#6e1c14",
    "highlight": "#c4f135"
  },
  "export": { "filePrefix": "gang-sheet-logo" },
  "removeBg": { "tolerance": 32, "maxDimension": 1600 }
}
```

| Key | Type | Effect |
|-----|------|--------|
| `businessName` | string | Browser tab title prefix |
| `toolTitle` | string | Header title — the **last word is accent-coloured** (mock's two-tone look) |
| `tagline` | string | Header subtitle |
| `logoUrl` | string (url/dataURI) | Optional logo shown left of the title; empty = hidden |
| `colors.accent` / `accentBright` / `accentDim` | hex | Primary accent (buttons, active states, split line); `--volt` family |
| `colors.highlight` | hex | Secondary pop (focus rings, "After" badge); `--acid` |
| `export.filePrefix` | string | Downloaded filename stem (`<prefix>-transparent.png`) |
| `removeBg.tolerance` | number | Background colour match radius (higher = removes more) |
| `removeBg.maxDimension` | number | Caps working resolution (px) for responsiveness |

### Three ways to supply config (first hit wins, deep-merged over defaults)

1. **`window.TOOL_CONFIG = {…}`** — a host page sets it inline before the tool script runs.
2. **`?config=<url>`** — e.g. `index.html?config=/customer-packages/oceanaire/config.json`.
   This is how the showroom live-demos a customer without copying the tool.
3. **`./config.json`** — co-located file. The normal per-customer deploy.

---

## API surface (for serving via MidnightFusion API later)

Today the tool is **shipped as files** (copy the folder + a config). The same
capabilities are structured so they can move behind the MidnightFusion API without
changing the UI contract.

### Runtime config contract
- **Input:** a `config.json` object matching the schema above.
- **Resolution:** `window.TOOL_CONFIG` → `?config=<url>` → `./config.json` → defaults.
- To serve dynamically, host `config.json` at a per-tenant URL and load the tool with
  `?config=https://api.midnightfusion.io/v1/tenants/{id}/tools/gang-sheet-logo-maker/config`.

### Core operations (currently in-browser; candidates to expose as endpoints)
| Operation | In-browser function | Suggested endpoint | Input → Output |
|-----------|--------------------|--------------------|----------------|
| Remove background | `removeBackground(src)` | `POST /v1/tools/gang-sheet-logo-maker/remove-bg` | image (dataURI/multipart) + `{tolerance,maxDimension}` → transparent PNG |
| Export | `doExport()` | client-side; no endpoint needed | current result → PNG download |

**`removeBackground(src) → Promise<pngDataURL>`** is a pure function (no DOM side
effects beyond a temp canvas) and is the natural first thing to lift server-side for
a heavier/AI-backed engine. Swap-in point is marked in `index.html` at the
`REMOVE BACKGROUND` comment block; the UI calls it through `runRemoveBG()`, so a
server call can replace the body without touching any button wiring.

### Extending the tool
Buttons are **data-driven**. Add an entry to `QUICK_ACTIONS`, `TOOLS`, or
`PRODUCTION_TOOLS` in `index.html` and it self-wires. Route real behaviour by adding
a branch in `handleAction(group, id, label)` keyed on the button `id`.

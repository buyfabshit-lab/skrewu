# Camo Tool

Fill any logo with **169 seamless camo patterns** — or any solid color — stroke
it, and export a print-ready 300 DPI transparent PNG. Upload a logo → its alpha
channel becomes the mask → the fill renders only inside the shape.

> **Zero dependencies.** One folder = one tool. Markup, styles and logic all
> live in `index.html`. Nothing here imports from the site — drop this folder
> on any static host and it runs.

```
camo-tool/
├── index.html     # the entire tool (self-contained)
├── config.json    # per-customer branding + pattern-library source
├── manifest.json  # ready-to-upload tile manifest for the camo library bucket
└── README.md      # you are here
```

---

## What it does

| Area | Status | Notes |
|------|--------|-------|
| Logo intake | ✅ | PNG with transparency, SVG, WebP; drag & drop or picker; shape detection is off the **alpha channel**, so white/single-color logos work. `TEST LOGO` loads a built-in star. |
| Fill modes | ✅ | `ORIGINAL` (as uploaded), `SOLID` (full picker + one-tap swatches), `CAMO` (169-pattern library). |
| Camo control | ✅ | Log-scale size slider (0.02×–8×, tiles the pattern — never distorts the logo edge), drag on canvas to reposition, 0–360° rotation. |
| Stroke | ✅ | Inside/outside toggle, 0–40 px live width, color picker (+ EyeDropper where supported). Center stroke is on the roadmap. |
| Export | ✅ | Transparent PNG at 1×/2×/4× with a real `pHYs` 300 DPI chunk. Filename: `<logo>-<pattern>-<timestamp>.png`. |
| Save to locker | 🔧 stub | Declared on the board (`save-to-locker` → Supabase); needs a small server route so the storage key stays out of the browser. Client hook is one `fetch` after export. |

## API surface

The board wires these actions (see `CAPS.camo` in `board.js`):

| Action | Runs on | What it does |
|---|---|---|
| `apply-pattern` | browser | Fill logo with selected camo |
| `set-border` | browser | Add stroke inside/center/outside |
| `download-png` | browser | Export result as PNG |
| `save-to-locker` | supabase | Save to client locker |

`apply-pattern`, `set-border` and `download-png` run entirely client-side today.
`save-to-locker` is the one server-backed action — not yet implemented (see
table above).

## Deploy

Any static host (Netlify, Vercel, S3, GitHub Pages):

1. Copy this folder to your host.
2. Edit `config.json` with the customer's branding (see below).
3. Serve it. `index.html` fetches `./config.json` at load over HTTP.

Opening `index.html` from disk (`file://`) works too — the browser blocks the
`config.json` fetch, so the tool falls back to its built-in defaults.

## Config surface (`config.json`)

Per-customer swap point — no code changes. Also loadable from a URL via
`index.html?config=<url>` (the `/customer-packages` pattern).

```json
{
  "businessName": "SKREW U",
  "toolTitle": "CAMO TOOL",
  "tagline": "// MASK & FILL OPS",
  "camoLibraryBase": "https://…/storage/v1/object/public/open-block/camo",
  "colors": { "accent": "#ffd400", "accentDim": "#b89a00", "olive": "#5a6142", "oliveHi": "#8a936a" }
}
```

- `toolTitle` / `tagline` — header + page title.
- `colors` — camelCase keys map to the CSS custom properties in `:root`
  (`accentDim` → `--accent-dim`). Any token in the stylesheet can be overridden.
- `camoLibraryBase` — where the patterns live (see next section).

## Backing data: the pattern library

Patterns are plain PNG tiles in public storage. The tool fetches
`{camoLibraryBase}/manifest.json` for the tile list, renders thumbnails from
`{camoLibraryBase}/thumb/<id>.png` for an instant grid, and swaps in the
full-res `{camoLibraryBase}/<id>.png` when loaded. If the manifest is missing
or the network is down, an embedded fallback list (all 169 tiles) keeps the
grid working. `manifest.json` in this folder is a ready-to-upload copy for the
bucket.

Default source: Supabase public storage, bucket `open-block`, prefix `camo/`.

## Rendering pipeline (for the next engineer)

1. Logo → offscreen mask canvas (only alpha matters).
2. Fill layer: solid via `source-in`, or camo via `createPattern(tile,'repeat')`
   with a `DOMMatrix` transform (translate → rotate → scale), then
   `destination-in` against the mask. Pattern scale is normalized to logo width
   so preview and export match exactly.
3. Stroke band: dilate (outside) or erode (inside) the mask by stamping it
   along disk offsets, diff against the original mask, colorize via `source-in`.
4. Composite: outside band under the fill, inside band over it, clipped to the
   mask.

Everything live-updates; the only button that does work is Export.

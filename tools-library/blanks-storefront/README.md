# Blanks Storefront

**One-line pitch:** Pick a blank, then design it — a live apparel-blanks catalog
(S&S Activewear) where every product has a **Design this blank** button into your
designer.

Portable tool module. Two halves in one folder:

```
blanks-storefront/
├── index.html                     # storefront (static)
├── app.js                         # fetch feed, render grid, "Design this blank"
├── config.json                    # branding + functionUrl + designerBaseUrl (swap this)
├── README.md                      # this file
└── functions/
    └── ss-products/               # the server-side S&S Activewear feed
        ├── index.js               # zero-dep Node function + standalone server
        ├── package.json
        └── README.md              # env vars + deploy
```

- **Storefront** = static frontend. It never talks to S&S directly — only to the
  `ss-products` function, so no supplier credentials ever reach the browser.
- **ss-products** = server-side feed that calls S&S Activewear with Basic auth
  (env-only creds) and returns a normalized `blanks` list.

## Deploy (two halves)

1. **Function** — deploy `functions/ss-products` to any Node host (Railway, Render,
   a Vercel/Netlify function, or a Supabase Edge Function). Set its env vars
   (below). Note its public URL, e.g. `https://…/ss-products`.
2. **Storefront** — host `index.html` + `app.js` + `config.json` on any static host
   (or serve the folder from `fusion-command-studio`). In `config.json` set:
   - `functionUrl` → the deployed function URL,
   - `designerBaseUrl` → where **Design this blank** should send the customer.
3. Open the storefront.

Zip-droppable: the whole folder is self-contained — zip it, hand it off, or copy it
into `fusion-command-studio` as-is.

### Env vars (the `ss-products` function needs these)

| var | required | default | purpose |
|---|---|---|---|
| `SS_ACCOUNT_NUMBER` | ✅ | — | S&S Activewear account # (Basic-auth user) |
| `SS_API_KEY` | ✅ | — | S&S Activewear API key (Basic-auth pass) |
| `SS_API_BASE` | — | `https://api.ssactivewear.com/v2` | API base |
| `SS_CDN_BASE` | — | `https://cdn.ssactivewear.com/` | image CDN base |
| `ALLOWED_ORIGIN` | — | `*` | CORS origin — set to the storefront's origin in prod |
| `PORT` | — | `8787` | standalone server port |

The storefront itself needs **no secrets** — just `functionUrl` and
`designerBaseUrl` in `config.json`.

## Config options (`config.json`)

| key | purpose |
|---|---|
| `branding.*` | Name, tagline, hero copy, logo, accent colors |
| `functionUrl` | The `ss-products` endpoint |
| `designerBaseUrl` | Where **Design this blank** navigates; the blank is appended as `?style=&brand=&name=&img=` |
| `defaultLimit` | Max blanks fetched (default 60) |
| `demoFallback` | If `true`, render a small demo catalog when the function is unreachable |

## "Design this blank" wiring

Each button navigates to:

```
{designerBaseUrl}?style={id}&brand={brand}&name={styleName}&img={image}
```

Point `designerBaseUrl` at your designer/workbench. While it's the `REPLACE…`
placeholder, clicking shows a toast instead of navigating (safe by default).

> Wiring note: if the designer is the MidnightFusion workbench on 007, hold until
> the wire-sweep PR lands its storage key convention, then set `designerBaseUrl` to
> the workbench route. Nothing here depends on that key convention — this tool is a
> read-only catalog feed.

## Run it locally

```bash
# 1) function
cd functions/ss-products
SS_ACCOUNT_NUMBER=xxxxx SS_API_KEY=yyyyy node index.js      # → :8787

# 2) storefront (any static server), from the blanks-storefront folder
python3 -m http.server 5173
# open http://localhost:5173/index.html
```

With `config.json`'s default `functionUrl` (`http://localhost:8787/ss-products`),
the storefront picks up the live feed. No creds yet? It shows the demo catalog so
the page and the **Design this blank** buttons still work.

## API surface (for serving via the MidnightFusion API later)

| operation | HTTP | input | output |
|---|---|---|---|
| List blanks | `GET /ss-products` | `?search=&brand=&category=&limit=` | `{ blanks[], count, source }` |
| Health | `GET /health` | — | `{ ok, credentials, base }` |

Swap S&S for SanMar/alphabroder by adding a sibling normalizer with the same
`blanks` output shape — the storefront doesn't change.

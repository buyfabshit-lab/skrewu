# ss-products function

Server-side feed that pulls the **S&S Activewear** styles catalog and returns a
small normalized `blanks` list for the storefront. Zero dependencies (Node 18+).

Credentials are **environment-only** and stay server-side — the browser never sees
the S&S account number or API key. It only ever talks to this function.

## Endpoints

| method / path | returns |
|---|---|
| `GET /ss-products` (also `/`, `/products`, `/blanks`) | `{ blanks: [...], count, source }` |
| `GET /health` | `{ ok, credentials, base }` |

Query params: `?search=`, `?brand=`, `?category=`, `?limit=` (default 60).

**Blank shape:** `{ id, styleName, brand, title, category, image }`.

## Env vars

| var | required | default | purpose |
|---|---|---|---|
| `SS_ACCOUNT_NUMBER` | ✅ | — | S&S Activewear account # (Basic-auth username) |
| `SS_API_KEY` | ✅ | — | S&S Activewear API key (Basic-auth password) |
| `SS_API_BASE` | — | `https://api.ssactivewear.com/v2` | API base |
| `SS_CDN_BASE` | — | `https://cdn.ssactivewear.com/` | image CDN base |
| `ALLOWED_ORIGIN` | — | `*` | CORS origin (set to the storefront's origin in prod) |
| `PORT` | — | `8787` | standalone server port |

> Get `SS_ACCOUNT_NUMBER` + `SS_API_KEY` from your S&S Activewear account rep /
> developer portal. Never commit them — env vars only.

## Run standalone

```bash
cd functions/ss-products
SS_ACCOUNT_NUMBER=xxxxx SS_API_KEY=yyyyy node index.js
# → ss-products listening on :8787
curl "http://localhost:8787/ss-products?brand=gildan&limit=12"
```

## Deploy options

- **Railway / Render / any Node host:** set the env vars, `npm start`. Point the
  storefront's `functionUrl` at the deployed URL + `/ss-products`.
- **Vercel / Netlify function:** import `handler` (or `fetchBlanks`) from `index.js`
  and return `handler(req.query)` as JSON. The built-in http server is ignored when
  imported.
- **Supabase Edge Function (Deno):** port the `fetchBlanks` body (same Basic-auth
  fetch) into an edge function; the normalize logic is identical.

## Swapping suppliers

The only supplier-specific code is `fetchBlanks()` (the S&S URL, auth, and field
mapping). To add SanMar / alphabroder, add a sibling normalizer with the same
output shape and pick by an env flag — the storefront doesn't change.

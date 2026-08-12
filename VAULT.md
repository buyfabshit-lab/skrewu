# The Vault — MCG logo & design archive backend

A Supabase-backed store for the entire Midnight Creative Group logo/design
archive (75k+ assets). Masters stay private; web-sized derivatives are served to
the SKREWU site for browse/search/filter.

Backend project: **NW2** (`qmztuagvxopahowexrum`, us-west-2).

---

## Architecture

```
archive folder tree ──► scripts/bulk-import.mjs ──► Supabase
                                                     ├─ storage: vault-originals (private masters)
                                                     ├─ storage: vault-public    (web-sized webp)
                                                     └─ table:   public.vault_assets (paths + metadata)

SKREWU site  ── sb.rpc('vault_search'/'vault_brands') ──► #vault grid (browse / brand filter / search)
admin tools  ── edge fns: vault-list / vault-sign / vault-upload
```

- **`vault-originals`** — private, 1 GiB/file. Never public. Pulled only via
  short-lived signed URLs from `vault-sign`.
- **`vault-public`** — public read *by URL only* (not listable). Holds the
  web-sized `.webp` (or `.svg`) derivatives the grid renders.
- **`public.vault_assets`** — `id, filename, storage_path, public_path, brand,
  style_tags[], width, height, file_hash (unique/dedupe), file_size, mime_type,
  source_path, created_at`. Indexed on `brand`, `style_tags` (GIN),
  `filename` (trigram), `created_at`.
- **RLS** — anon/authenticated can **read** metadata; **all writes are
  service_role-only** (import script + edge functions). No anon write path.

## Database objects (already applied live)

Migrations in `supabase/migrations/`:

| version | what |
|---|---|
| `20260724000001_lock_down_public_bucket_listing.sql` | drops the broad SELECT/list policies on all 6 legacy public buckets (incl. `galien-evidence`) — kills anon `.list()` enumeration (advisor lint 0025) while public-URL reads keep working |
| `20260724000002_vault_assets_schema_and_buckets.sql` | creates the two vault buckets, the `vault_assets` table + indexes + RLS, and the `vault_search` / `vault_brands` RPCs |

RPCs (callable by anon):
- `vault_search(p_query, p_brand, p_tags text[], p_limit, p_offset)` → rows
- `vault_brands()` → `(brand, n)` facet counts

## Edge functions (`supabase/functions/`)

> **Deploy status:** source is committed; deploy them from an interactive
> Supabase session (the automated session's deploy step was permission-gated).
>
> ```bash
> supabase functions deploy vault-list   --project-ref qmztuagvxopahowexrum --no-verify-jwt
> supabase functions deploy vault-sign   --project-ref qmztuagvxopahowexrum --no-verify-jwt
> supabase functions deploy vault-upload --project-ref qmztuagvxopahowexrum --no-verify-jwt
> ```

| function | auth | purpose |
|---|---|---|
| `vault-list` | public | `GET/POST` browse+search → metadata + ready `public_url`s. Surfaces only anon-readable metadata. |
| `vault-sign` | service-key (`x-vault-key` / `Authorization: Bearer`) | mint short-lived signed URL(s) for private originals |
| `vault-upload` | service-key | batch ingest (≤200 files/call): sha256, dedupe, store master + optional web derivative, insert row |

All three set `verify_jwt=false`; `vault-sign`/`vault-upload` implement their own
service-key gate, so only a holder of the project service_role key can write or
pull originals.

## Bulk import (the 75k archive)

Runs on a machine that has the archive mounted. Talks to Supabase directly with
the service_role key (bypasses the edge function for speed).

```bash
cd scripts && npm install                      # @supabase/supabase-js + sharp
export SUPABASE_URL="https://qmztuagvxopahowexrum.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key — never commit>"

# dry run first (hash + plan, no writes)
node bulk-import.mjs --dir /path/to/MCG-archive --dry-run

# real ingest with web-sized derivatives
node bulk-import.mjs --dir /path/to/MCG-archive --public --concurrency 8
```

- **Brand** is inferred from the first folder under `--dir` (e.g.
  `…/Death Corps/…` → brand `Death Corps`), or forced with `--brand`.
- **Tags** come from the in-between folders plus any `--tags a,b,c`.
- **Dedupe** is by sha256 of the file bytes — rerun any time; already-ingested
  files are skipped. Content-addressed paths make retries idempotent.
- Handles png/jpg/webp/gif/tiff/bmp/svg/pdf/ai/eps/psd; `--public` derivatives
  are rendered for raster types (svg copied as-is).

## Frontend

The site's **Vault** section (`#vault` in `index.html`, module at the bottom of
`app.js`) renders a grid from `vault_search`, with brand-chip filters from
`vault_brands` and a debounced text search. It uses the existing anon Supabase
client — no new keys. Empty until the importer runs; then it fills automatically.

## Open decisions for the operator

- **Original downloads on the site.** Grid shows web-sized derivatives; pulling
  a *master* needs `vault-sign` (service-key gated). There's no member auth on
  the site yet, so "download original" isn't wired to the public UI. Decide the
  gate (members area / admin tool) before exposing masters.
- **Brand taxonomy.** Import infers brand from folder names. If the archive
  isn't foldered by brand, pass `--brand` per run or we add a mapping file.

# Direct publishing from Midnight Fusion to SKREWU

The source update adds **SKREWU Shop** as the default publishing destination in
Midnight Fusion’s Product Creator. **Publish to SKREWU** opens the shop owner
desk, waits for owner sign-in, renders a fresh mockup from the click-time design,
exports each front/back print at 300 DPI, and publishes the selected sizes,
colors, price and product details. No manual download/upload is required.

A success message is shown only after the authenticated shop API saves the
published product. A failed print export or upload stops publication. The
existing review-only `openShopDraft` handoff remains available; direct publishing
uses `publishToShop`. The editor never receives shop passwords, cookies or API
keys. The two-window handshake uses the exact opener, origin and transfer ID.

## Source and deployment status

Updated October 4, 2026. GitHub access is restored. The designer changes were
applied to the current `buyfabshit-lab/midnightfusion-standalone-staging` source
at `68f2486c233f096b731837ba348bd500b7452ee9`, preserving the existing UI and
server changes. TypeScript, the production build, and 14 focused tests pass.
The reviewed changes are on `codex/skrewu-direct-publishing`.

The live designer is `https://oceanaire-tee-production.up.railway.app`.
Both Railway services use this repository's `main` branch, so merge only after
the receiving shop is deployed and verified. The shop currently uses direct
Netlify uploads, with no Git deployment configured. Deployment authorization
has been given; Netlify CLI authentication is the remaining upload prerequisite.

## Apply the reviewed changes

1. GitHub repository access is verified for both the designer and `buyfabshit-lab/skrewu`.
2. Obtain the current source in an isolated review branch. Review and apply
   `designer-update/SKREWU_Direct_Publishing.patch`. It updates ProductCreator,
   adds its real export adapter and bridge, and makes print export fail if any
   artwork layer cannot be processed. Preserve current assets and other changes.
3. On a controlled shop staging copy, validate the two new columns in
   `design-import-schema-review.sql`. Generate the actual migration using the
   Supabase CLI after verifying the current schema; the supplied SQL is a review
   draft, not an applied migration.
4. Set the shop’s server-only `RETAIL_DESIGNER_ORIGINS` to the exact editor
   origin: `https://oceanaire-tee-production.up.railway.app`. This setting is on
   the Netlify shop, not the Railway designer. Owner authentication remains
   required. No wildcard origins or cross-origin API permissions are added.
5. Verify the staging two-window flow, owner login, exact original bytes,
   catalog privacy and a saved product receipt. Check deployment-specific
   Cross-Origin-Opener-Policy so the popup retains its opener.
6. Roll out the reviewed shop and designer changes after approval of the
   verified staging result. A Railway redeploy alone cannot install this code.

## Product and artwork data

The public store shows its existing single product image. It represents the
first selected color and primary front/back print view. All selected variants
are included. Separate front and back print files, dimensions and a design
fingerprint remain in private product data; owner links expose them only after
sign-in. The server copies those files and details into the immutable checkout
snapshot, which the existing paid-order transaction carries into OmniFlow’s
`raw_platform_data.retail_item`.

This update publishes listings. Printing, shipping and payment processing still
follow the shop’s existing configuration and checkout gates.

Each image must be PNG, JPG or WebP and no larger than **4 MB**. Oversized print
files are rejected, never resized or recompressed. The current editor’s generic
side view is ambiguous, so the adapter rejects it instead of dropping that
artwork. Front/back publishing is supported; specific sleeve placements need a
corresponding editor mapping before they can be transferred.

## Validation commands

Designer: install the existing lockfile with its pinned pnpm version, then run
`npm run check`, `npm run build`, and
`node node_modules/vitest/vitest.mjs run server/skrewuPublish.test.ts server/skrewuExport.test.ts server/publishDropdown.test.ts --maxWorkers=2 --minWorkers=1`.

Shop: `npm ci`, `npm run check`, `npm test`, then
`node integration/direct-publish-smoke.mjs`. The HTTP smoke test only starts the
local review adapter, creates a synthetic local listing, checks its originals
and privacy, archives it, and stops that child process. It cannot contact live
Supabase, Stripe or Netlify services.

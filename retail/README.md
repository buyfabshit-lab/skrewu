# SKREW U retail store — review draft

## October 2, 2026: direct SKREWU publishing

The reviewed designer patch adds **Publish to SKREWU** using the actual
Product Creator mockup and 300 DPI print exporters. Its authenticated popup
handoff publishes the product after every required file upload succeeds. The
original review-only draft handoff remains supported. Front/back production
files stay private and are copied into the existing checkout/order snapshot.

This source has not been deployed. See [the connection instructions](integration/CONNECT_DESIGNER.md)
for current repository access, staging setup and rollout requirements, and
[the validation record](integration/VALIDATION_2026-10-02.md) for the 34 focused
checks and limits. The original service setup requirements below still apply.

Replaces the missing Manus retail capability while retaining SKREW U's Death
Corps font and wholesale-form palette. This is an isolated app in `retail/`.
The root Netlify project still publishes only `public/`; the community site,
wholesale form and Blanks catalog remain intact. No live deployment or database
changes were made. PR 24 was inspected but not merged or overwritten.

## Review on this computer

From `retail/`, install with `npm ci`, then run `npm run preview` (Node 22+).
Open `http://127.0.0.1:4173` and `http://127.0.0.1:4173/owner.html`.

The local review desk has a clearly labeled sign-in shortcut. That shortcut is
implemented only in `preview.mjs`, outside the deployed directory and outside
the production dependency graph. It cannot enable production access. The
preview listens only on 127.0.0.1 and rejects other Host/Origin values.

Three **sample** tees demonstrate the storefront. They are not recovered
products, prices, stock or real photos. Upload a real photo to create a product.
Review writes persist in ignored `.preview-data/`, not browser storage. Keep
that folder if you add your own drafts. It is **not automatically migrated**
to the production store. Avoid entering customer or payment information here.

Owner flow: add shirt → upload PNG/JPG/WebP → name, description, garment details,
price → add size/color combinations → save draft → switch status to Published
and save → view in shop. Archive removes a shirt from the rack; switching back
to Published restores it. Each option has an availability switch. Saving during
uploads and switching products during a save/upload are blocked.

## What is implemented

- Responsive shop, direct product links, accessible product dialog, variant
  choices, quantity and subtotal; distinct loading, empty, unavailable and error states.
- Owner sign-in backed by Supabase Auth; exact approved user IDs checked on
  every protected request. Secure HttpOnly SameSite cookies, one-hour maximum;
  no token in browser storage, no public signup or owner key in a link.
- Validated product edits and uploads with server-only database/storage access.
  Private bucket images are signed for ten minutes; a previously obtained image
  URL can remain usable for that period after a product is archived.
- Stripe hosted Checkout generated from a durable server-side snapshot, with
  server price, available variant, quantity validation, stale-price rejection,
  stable idempotency key, required shipping address and configured shipping rate.
- Signature-verified webhook and a single PostgreSQL transaction that marks
  the retail order paid and writes a SKREW U OmniFlow order. Retries cannot
  duplicate it or overwrite an operator's status or notes. Failed writes return
  non-2xx so Stripe retries. Payment confirmation is never inferred from a URL.
- Existing tool-sale webhook ignores retail-tagged sessions, preventing a
  second, misclassified tool order when both Stripe endpoints receive the event.

## Service setup still required (before real sales)

1. Create/use a **staging** Supabase project with the existing OmniFlow table and
   `skrewu` tenant. `schema.sql` is a review draft, not a migration already applied.
   Validate on staging, review advisors, then generate a migration with the
   Supabase CLI. The SQL creates new retail tables and a private storage bucket;
   anon/authenticated roles have no grants. Its RPC is SECURITY INVOKER and only
   executable by the service role. Existing OmniFlow column types/constraints
   and the SKREW U tenant were checked read-only on 2026-09-12.
2. Provision the approved owner in Supabase Auth. Put the owner's UUID in
   `RETAIL_OWNER_IDS`. Owner credentials must be set using the service's secure
   interface, never in chat or public files. Configure normal password recovery
   in Supabase before launch; this first version does not add a recovery screen.
3. Prepare a separate Netlify **staging** project, base `retail`, publish `public`.
   Set server-only values from `.env.example` in its environment. Set the exact
   HTTPS `RETAIL_ORIGIN`; do not share production credentials with arbitrary
   deploy previews. There is deliberately no wildcard CORS.
4. Use Stripe **test mode** first. Register `/api/retail/webhook` on that retail
   site for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
   Pin webhook version to **2026-08-26.dahlia**, matching Checkout creation.
   Set the signing secret and test API key securely. Deploy the existing tool
   receiver's retail-ignore guard too if that endpoint is registered on the
   same Stripe account.
5. Set shipping countries and a Stripe shipping rate, shipping/turnaround text,
   return terms, and an explicit automatic-tax choice. These are business
   decisions, not inferred defaults. The owner must confirm who prints and
   ships. No supplier, print-on-demand account, subscription, or automatic
   fulfillment has been activated.
6. Set `RETAIL_CHECKOUT_ENABLED=true` **only after** the webhook and schema are
   connected. Complete a test purchase including a shipping address; verify
   the Stripe receipt, correct size/color/quantity and one OmniFlow order.
   Redeliver the webhook; verify no duplicate and no status reset. Confirm the
   owner can open the authenticated SKREW U OmniFlow console. Merely setting
   variables does not prove the service connections are healthy.
7. Upload actual shirt photos and verified product details/prices/options.
   Review the storefront and a real fulfillment plan. Only after explicit
   production review connect the desired store URL and update community Shop
   links. Production keys also require `RETAIL_ALLOW_LIVE=true`; it defaults off.
   No domain changes are included in this draft.

## Scope and limits

This version supports one shirt/variant per checkout, with quantity 1–20. It
does not yet combine multiple designs into a cart or track/reserve a finite
stock count; availability is an owner-controlled switch. Do not sell scarce
one-off inventory without adding atomic reservations. Orders require manual
fulfillment action. Refund handling is through Stripe, and refund/cancellation
events are not yet synchronized into OmniFlow. Wholesale writes `shop_orders`;
it still needs a separate bridge to join the retail orders in `omniflow_orders`.

Production Supabase storage/Auth calls, deployed Netlify behavior, Stripe
checkout and callback delivery remain **untested against connected services**.
No real charge was attempted. The preview is not live commerce.

## Verification

`npm run check` verifies scripts, assets, public boundaries and bundles the
Netlify entry plus actual imports. `npm test` runs focused validation/security
tests and a disposable PGlite PostgreSQL contract test, including private table
permissions, mismatched totals, transactional rollback and replay idempotency.
PGlite is a local test dependency, not the production database.

Browser review covered photo upload, draft save, publish, archive, quantity
subtotal, and desktop/mobile layouts. The archived “Upload workflow check” row
is disposable local test data. Root community files were not modified.

Implementation references: [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create),
[Stripe webhook verification](https://docs.stripe.com/webhooks),
[Stripe API versioning](https://docs.stripe.com/api/versioning),
[Supabase verified user lookup](https://supabase.com/docs/reference/javascript/auth-getuser),
[Supabase uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads).

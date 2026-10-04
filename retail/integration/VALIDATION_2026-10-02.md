# Direct SKREWU publishing validation — October 2, 2026

## Completed locally

- Designer TypeScript check passes.
- Designer production frontend/server build passes. The recovered backup has
  existing unresolved font/background asset references and a large-bundle
  warning; the patch does not replace deployed assets.
- Fourteen focused designer tests pass: platform routing, exact selected
  variants, click-time snapshots, real front/back 300 DPI exports, exact byte
  transfer, invalid inputs, and refusal of partial artwork exports.
- Shop syntax, assets, public boundary and Netlify server bundle checks pass.
- All twenty shop tests pass. They cover owner authentication, exact
  origin/opener/transfer validation, publish capabilities and saved receipts,
  complete uploads before publication, private originals, legacy editor
  preservation, server pricing, payment signatures and checkout gating.
- Disposable PostgreSQL verifies front/back print paths and details reach
  OmniFlow’s stored order item. Paid-order writes remain private, atomic and
  idempotent and preserve operator fulfillment status.
- Actual local HTTP smoke test passes: it uploads a preview plus distinct front
  and back originals, publishes one local shirt, verifies both originals byte
  for byte through owner links, verifies the public catalog excludes all print
  fields, then archives the synthetic listing and stops its local server.
- The shop and designer bridge copies are identical.

## Remaining rollout checks

- GitHub access to the current deployed repository, patch review and staging
  installation. The saved backup has not been compared in full to deployed
  commit cfe0ea5263907d0a129723bc1e91073bc583e5e6.
- Staging database column update and exact approved designer-origin setting.
- Browser visual review and real two-window owner login/export/upload/publish
  on staging. This cloud browser blocks loopback review URLs; automated and
  local HTTP checks do not replace that staging check.
- Live Supabase upload verification and deployment-specific popup/CSP behavior.
- Existing checkout/payment readiness remains separate from listing publication.

No live deployment, production migration, live payment or live listing was
created. Files larger than 4 MB and ambiguous side placements are rejected.

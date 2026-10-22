# Black Shirt Shop integration

The public `/shop/` page restores the saved black/green **SKREW U — The Shirt Shop**
design from `backup/skrewu-shop-2026-10-15`, commit
`a7f129fdf557adcd64178010a8fc57cadb57cdfb`, `retail/public/`.
The stylesheet, font and favicon are copied without changes.

The storefront is deliberately in **catalog-closed mode**: it makes no inventory,
authentication or payment requests, displays no sample products, and plainly
states that the catalog is not connected and checkout is closed. The saved
backend and its owner workflow remain on the backup branch / PR #25; they have
not been installed or enabled by this change.

All five retail links in the current `main` homepage now navigate to `/shop/`
in the same tab. The Customs `#shop` auction anchor, auction behavior, community
content, webhook source and private tools are unchanged.

## Source and deployment review

Before editing, Netlify's published deploy was `6ac440a0b6698e00080c8326`,
commit `ef049d84116bbe177d4246f020c896ea1513f919` on
`restore/skrewu-netlify-2026-10-05`. The four newer files on `main` were inspected:
shop links, restoration notes, a config comment and the protected-site identity
mapping. This branch retains that newer work. Open PRs, including #24, #25 and
#27, were inspected for overlap and were not merged or modified.

Build with `node scripts/build-netlify-site.mjs` (public is the default). The
public build continues to contain the same two webhook handlers and their two
support modules. No Supabase connection, schema change, migration, product
publication, Stripe setup or live payment is part of this installation.

To open the catalog later, obtain explicit authorization for the specific
Supabase project and the proposed read/write operations, verify the real retail
schema and private image storage, configure the saved retail backend, and load
verified product details. Checkout additionally requires explicit payment
authorization, shipping/returns/fulfillment decisions, Stripe test-mode and
webhook verification before any live enablement. See the saved retail README.

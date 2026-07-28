-- SECURITY: order-artwork (public bucket, created 2026-07-25 after the initial
-- lockdown) had a broad SELECT policy allowing anon .list() enumeration
-- (Supabase advisor lint 0025) — same class as the original directed open item.
-- Drop it; public-URL reads keep working (the bucket stays public).
-- APPLIED LIVE 2026-07-28 to NW2 (qmztuagvxopahowexrum).
-- After this, 0 SELECT policies remain on storage.objects → no bucket is
-- anon-listable.
drop policy if exists "Anyone can read order-artwork" on storage.objects;

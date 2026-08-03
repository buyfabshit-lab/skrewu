-- SECURITY: remove broad SELECT (enumeration/list) policies on storage.objects
-- for public buckets. Public buckets serve objects via their public URL WITHOUT
-- needing a storage.objects SELECT policy, so dropping these disables anon
-- `.list()` enumeration (Supabase advisor lint 0025) while leaving all existing
-- public-URL reads intact. The SKREWU frontend (app.js) never calls .list(); it
-- reads by known getPublicUrl paths only.
-- Scope: NW2 / Skrew U project buckets, incl. galien-evidence (per mission).
-- APPLIED LIVE 2026-07-24 (migration version 20260724…).

drop policy if exists "Public read access"     on storage.objects; -- designs
drop policy if exists "Public can read evidence" on storage.objects; -- galien-evidence
drop policy if exists "Public read pin-media"   on storage.objects; -- pin-media
drop policy if exists "Public read site-assets" on storage.objects; -- site-assets
drop policy if exists "storage_select"          on storage.objects; -- videos
drop policy if exists "Public read zine-images" on storage.objects; -- zine-images

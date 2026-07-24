-- ============================================================
-- MCG LOGO / DESIGN VAULT  — storage backend for 75k+ assets
-- APPLIED LIVE 2026-07-24 to NW2 (qmztuagvxopahowexrum).
-- ============================================================

-- 1) Storage buckets ------------------------------------------------
-- vault-originals: PRIVATE masters. Served only via short-lived signed URLs
--   minted by the vault-sign edge function.
-- vault-public:    web-sized derivatives, PUBLIC read by URL. No broad SELECT
--   policy is created, so the bucket is NOT listable (lint 0025 stays clean).
-- Writes happen exclusively through the service_role key (edge functions +
-- bulk-import script), which bypasses RLS. No anon storage policies are created
-- for either bucket => locked down by default.

insert into storage.buckets (id, name, public, file_size_limit)
values ('vault-originals','vault-originals', false, 1073741824)   -- 1 GiB cap
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault-public','vault-public', true, 52428800,            -- 50 MiB cap
        array['image/webp','image/png','image/jpeg','image/gif','image/svg+xml'])
on conflict (id) do nothing;

-- 2) vault_assets table --------------------------------------------
create table if not exists public.vault_assets (
  id            uuid primary key default gen_random_uuid(),
  filename      text not null,                       -- original filename
  storage_path  text not null,                       -- path inside vault-originals
  public_path   text,                                -- path inside vault-public (web-sized), nullable
  brand         text,                                -- Death Corps, Skrew U, Black Metal, Death Squad, ...
  style_tags    text[] not null default '{}',        -- freeform style/subject tags
  width         integer,
  height        integer,
  file_hash     text not null,                       -- sha256 of original bytes (dedupe key)
  file_size     bigint,
  mime_type     text,
  source_path   text,                                -- original path on the import machine (provenance)
  created_at    timestamptz not null default now()
);

create unique index if not exists vault_assets_file_hash_key on public.vault_assets (file_hash);
create index if not exists vault_assets_brand_idx      on public.vault_assets (brand);
create index if not exists vault_assets_style_tags_idx on public.vault_assets using gin (style_tags);
create index if not exists vault_assets_filename_trgm  on public.vault_assets using gin (filename gin_trgm_ops);
create index if not exists vault_assets_created_idx    on public.vault_assets (created_at desc);

-- 3) RLS: public read of metadata; writes are service_role-only -----
alter table public.vault_assets enable row level security;

drop policy if exists "vault_assets public read" on public.vault_assets;
create policy "vault_assets public read"
  on public.vault_assets for select
  to anon, authenticated
  using (true);
-- (no INSERT/UPDATE/DELETE policies -> only service_role can write)

-- 4) Search + brand-facet helpers (SECURITY INVOKER, pinned path) ---
create or replace function public.vault_search(
  p_query  text   default null,
  p_brand  text   default null,
  p_tags   text[] default null,
  p_limit  int    default 60,
  p_offset int    default 0
) returns setof public.vault_assets
language sql stable security invoker set search_path = public as $$
  select va.*
  from public.vault_assets va
  where (p_brand is null or va.brand = p_brand)
    and (p_tags  is null or va.style_tags && p_tags)
    and (
      p_query is null or p_query = ''
      or va.filename ilike '%'||p_query||'%'
      or va.brand    ilike '%'||p_query||'%'
      or exists (select 1 from unnest(va.style_tags) t where t ilike '%'||p_query||'%')
    )
  order by va.created_at desc
  limit  least(coalesce(p_limit, 60), 200)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
grant execute on function public.vault_search(text,text,text[],int,int) to anon, authenticated;

create or replace function public.vault_brands()
returns table(brand text, n bigint)
language sql stable security invoker set search_path = public as $$
  select va.brand, count(*)::bigint
  from public.vault_assets va
  where va.brand is not null
  group by va.brand
  order by count(*) desc, va.brand asc
$$;
grant execute on function public.vault_brands() to anon, authenticated;

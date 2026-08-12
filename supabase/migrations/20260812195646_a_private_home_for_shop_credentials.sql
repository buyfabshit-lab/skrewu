-- Where a shop's authorisation for an outside platform lives.
--
-- The obvious place would have been tenants.shop, which already holds a shop's
-- domain and product ids. That would have been a bad mistake: /api/shop serves
-- tenants.shop to anyone with no key at all, because it is public storefront
-- config by design. A TikTok access token dropped in there would have been
-- readable by the whole internet the moment it was written.
--
-- So credentials get their own table, and it is never selected by any public
-- door. RLS on with no policies, exactly like the locker tables: reachable by
-- the service role and by nothing else.

create table if not exists public.tenant_integrations (
  tenant_slug  text not null references public.tenants(slug) on update cascade on delete cascade,
  provider     text not null,                 -- 'tiktok', later others
  external_id  text,                          -- their id for this shop
  credentials  jsonb not null default '{}',   -- tokens; never leaves the server
  status       text not null default 'connected',
  connected_at timestamptz not null default now(),
  expires_at   timestamptz,                   -- when the access token dies
  updated_at   timestamptz not null default now(),
  primary key (tenant_slug, provider)
);

alter table public.tenant_integrations enable row level security;
-- Deliberately no policies. Anything that needs this uses the service role.

comment on table public.tenant_integrations is
  'Per-shop credentials for outside platforms. Never served by a public endpoint.';
comment on column public.tenant_integrations.credentials is
  'Access and refresh tokens. Must never be selected into any response a browser sees.';

create index if not exists tenant_integrations_provider_idx
  on public.tenant_integrations (provider, status);

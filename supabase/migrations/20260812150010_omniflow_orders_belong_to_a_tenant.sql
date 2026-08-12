-- Every order belongs to exactly one shop.
--
-- Until now this table had no idea whose order it held, so a second shop
-- taking orders would have mixed its buyers into the first one's console and
-- onto the first one's livestream. Give the row an owner.

alter table public.omniflow_orders
  add column if not exists tenant_slug text;

-- The 24 orders already here are all DEATH CORPS's.
update public.omniflow_orders
   set tenant_slug = 'deathcorps'
 where tenant_slug is null;

alter table public.omniflow_orders
  alter column tenant_slug set not null;

alter table public.omniflow_orders
  add constraint omniflow_orders_tenant_fk
  foreign key (tenant_slug) references public.tenants(slug)
  on update cascade;

-- Every read is "this shop's orders, newest first".
create index if not exists omniflow_orders_tenant_idx
  on public.omniflow_orders (tenant_slug, intake_at desc);

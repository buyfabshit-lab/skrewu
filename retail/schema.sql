-- REVIEW DRAFT. Apply to a staging database first, then generate a Supabase
-- migration with the CLI after verification. No live database was changed.
begin;
create table public.retail_images (
  path text primary key,
  created_at timestamptz not null default now()
);
create table public.retail_products (
  id uuid primary key,
  name text not null,
  description text not null,
  garment text not null,
  price_cents integer not null check (price_cents between 100 and 100000),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  image_path text not null default '',
  artwork_path text not null default '',
  design_spec jsonb,
  variants jsonb not null check (jsonb_typeof(variants) = 'array'),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (status <> 'published' or image_path <> '')
);
create index retail_products_status_idx on public.retail_products(status, updated_at desc);
create table public.retail_orders (
  id uuid primary key,
  snapshot jsonb not null,
  status text not null check (status in ('pending','paid')),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  payment jsonb
);
alter table public.retail_images enable row level security;
alter table public.retail_products enable row level security;
alter table public.retail_orders enable row level security;
-- Only the server may read or write. The public catalog is explicitly filtered
-- by the retail API; owner authorization is verified against Supabase Auth.
revoke all on public.retail_images, public.retail_products, public.retail_orders from public, anon, authenticated;
grant all on public.retail_images, public.retail_products, public.retail_orders to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('retail-images','retail-images',false,4194304,array['image/jpeg','image/png','image/webp']);
-- No public object policies. Images are signed server-side for ten minutes.

-- SECURITY INVOKER, explicitly callable only by the server's service role.
-- Existing OmniFlow schema and the skrewu tenant are prerequisites.
create function public.retail_record_payment(session jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  o public.retail_orders%rowtype;
  who jsonb;
  shipping jsonb;
  snap jsonb;
begin
  if session->>'payment_status' is distinct from 'paid'
     or session->>'mode' is distinct from 'payment'
     or session->>'currency' is distinct from 'usd'
     or session->'metadata'->>'source' is distinct from 'skrewu-retail'
     or coalesce(session->>'id','') not like 'cs_%' then
    raise exception 'Invalid retail payment';
  end if;
  select * into o from public.retail_orders
    where id = (session->'metadata'->>'retail_order_id')::uuid for update;
  if not found then raise exception 'Unknown retail checkout'; end if;
  if o.stripe_session_id is not null and o.stripe_session_id <> session->>'id' then
    raise exception 'Order is bound to another checkout';
  end if;
  snap := o.snapshot;
  if (session->>'amount_subtotal')::bigint is distinct from (snap->>'subtotal_cents')::bigint then
    raise exception 'Payment subtotal does not match checkout';
  end if;
  if o.status = 'paid' then return; end if;
  who := coalesce(session->'customer_details','{}');
  shipping := coalesce(nullif(session->'collected_information'->'shipping_details','null'), nullif(session->'shipping_details','null'),'{}');
  insert into public.omniflow_orders (
    uct,tenant_slug,source,platform_order_no,customer_name,customer_email,
    customer_location,ship_address,skus,units,total_value,classification,status,tags,notes,raw_platform_data
  ) values (
    'UCT-RT-' || (session->>'id'),'skrewu','direct_api',right(session->>'id',8),
    who->>'name',who->>'email',
    concat_ws(', ',shipping->'address'->>'city',shipping->'address'->>'state',shipping->'address'->>'country'),
    concat_ws(E'\n',shipping->>'name',shipping->'address'->>'line1',nullif(shipping->'address'->>'line2',''),
      concat_ws(' ',shipping->'address'->>'city',shipping->'address'->>'state',shipping->'address'->>'postal_code'),shipping->'address'->>'country'),
    1,(snap->>'quantity')::integer,(session->>'amount_total')::numeric / 100,
    'DTC Standard','pending',array['Retail shirt','Paid'],
    concat(snap->>'quantity',' × ',snap->>'name',E'\n',snap->>'size',' / ',snap->>'color',
      E'\nShirt: ',snap->>'garment',E'\nShip to: ',shipping->>'name',E'\n',
      shipping->'address'->>'line1',E'\n',shipping->'address'->>'line2',E'\n',
      shipping->'address'->>'city',' ',shipping->'address'->>'state',' ',shipping->'address'->>'postal_code',
      E'\n',shipping->'address'->>'country',E'\nFulfillment requires owner action; no automatic print or shipment.'),
    jsonb_build_object('checkout',session,'retail_item',snap)
  ) on conflict (uct) do nothing;
  update public.retail_orders set status='paid',stripe_session_id=session->>'id',payment=session,paid_at=now() where id=o.id;
end;
$$;
revoke all on function public.retail_record_payment(jsonb) from public, anon, authenticated;
grant execute on function public.retail_record_payment(jsonb) to service_role;
commit;

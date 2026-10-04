import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Mirrors the relevant OmniFlow types/constraints verified read-only against
// the existing project. This is disposable local PostgreSQL, not Supabase live.
test('paid order transaction is private, atomic, idempotent and preserves fulfillment status',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon;create role authenticated;create role service_role bypassrls;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table public.tenants(slug text primary key);
      insert into public.tenants values ('skrewu');
      create table public.omniflow_orders(
        id uuid primary key default gen_random_uuid(),uct text not null unique,source text not null,platform_order_no text not null,
        intake_at timestamptz not null default now(),customer_name text,customer_email text,customer_location text,ship_address text,
        skus integer,units integer,total_value numeric,classification text check(classification in ('B2B Wholesale','DTC Standard','Expedited','Requires Review')),
        status text check(status in ('pending','flagged','processed')),tags text[],notes text,raw_platform_data jsonb,
        tenant_slug text not null references public.tenants(slug));
      grant usage on schema public to service_role,anon,authenticated;
      grant all on public.omniflow_orders to service_role;
    `);
    await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
    const a='33333333-3333-4333-8333-333333333333',b='44444444-4444-4444-8444-444444444444';
    const snap={name:'Test tee',garment:'Cotton',size:'XL',color:'Black',quantity:2,price_cents:3000,subtotal_cents:6000,
      artwork_path:'55555555-5555-4555-8555-555555555555.png',
      design_spec:{transfer_id:'66666666-6666-4666-8666-666666666666',source_design_id:'design-1',placement:'front',width_inches:12,height_inches:14,
        additional_prints:[{placement:'back',width_inches:8,height_inches:10,artwork_path:'77777777-7777-4777-8777-777777777777.png'}]}};
    for(const id of [a,b]) await db.query('insert into retail_orders(id,snapshot,status) values ($1,$2,\'pending\')',[id,JSON.stringify(snap)]);
    const event={id:'cs_test_order',mode:'payment',currency:'usd',amount_subtotal:6000,amount_total:6600,payment_status:'paid',
      metadata:{source:'skrewu-retail',retail_order_id:a},customer_details:{name:'Test Buyer',email:'test@example.invalid'},
      collected_information:{shipping_details:{name:'Test Buyer',address:{line1:'123 Test St',city:'Test City',state:'CA',postal_code:'00000',country:'US'}}}};
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from retail_products'),/permission denied/);
    await assert.rejects(db.query('select retail_record_payment($1)',[JSON.stringify(event)]),/permission denied/);
    await db.exec('set role service_role');
    await db.query('select retail_record_payment($1)',[JSON.stringify(event)]);
    let order=(await db.query('select * from omniflow_orders')).rows[0];
    assert.equal(order.units,2);assert.equal(Number(order.total_value),66);assert(order.ship_address.includes('123 Test St'));assert(order.notes.includes('XL / Black'));
    assert.equal(order.raw_platform_data.retail_item.artwork_path,snap.artwork_path);
    assert.deepEqual(order.raw_platform_data.retail_item.design_spec,snap.design_spec);
    await db.exec("update omniflow_orders set status='processed',notes='Packed by owner'");
    await db.query('select retail_record_payment($1)',[JSON.stringify(event)]);
    const rows=(await db.query('select * from omniflow_orders')).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].status,'processed');assert.equal(rows[0].notes,'Packed by owner');
    await assert.rejects(db.query('select retail_record_payment($1)',[JSON.stringify({...event,id:'cs_test_other',metadata:{...event.metadata,retail_order_id:b},amount_subtotal:1})]),/subtotal/);
    assert.equal((await db.query('select status from retail_orders where id=$1',[b])).rows[0].status,'pending');
    await db.exec('reset role; revoke insert on omniflow_orders from service_role; set role service_role;');
    await assert.rejects(db.query('select retail_record_payment($1)',[JSON.stringify({...event,id:'cs_test_other',metadata:{...event.metadata,retail_order_id:b}})]),/permission denied/);
    assert.equal((await db.query('select status from retail_orders where id=$1',[b])).rows[0].status,'pending');
  } finally { await db.close(); }
});

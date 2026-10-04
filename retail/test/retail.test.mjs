import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { productInput, selection, verifySignature, checkoutGaps } from '../server/domain.mjs';
import { createApp } from '../server/app.mjs';
import { production } from '../server/production.mjs';
import { createRequire } from 'node:module';

const id = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const product = { id, name:'Test shirt', description:'Test description', garment:'Cotton', price_cents:3450, status:'published', image_path:`${id}.png`, variants:[{size:'L',color:'Black',available:true},{size:'M',color:'Black',available:false}] };
const choice = {product_id:id,size:'L',color:'Black',quantity:2,expected_price_cents:3450,request_id:requestId};
function fake(overrides={}) {
  let records=[structuredClone(product)];
  return { preview:false,origin:()=> 'https://store.example',gaps:()=>[],policies:()=>({}),
    async authenticate(token){if(token!=='owner') { const e=Error('Sign in'); e.status=401; throw e;}},
    async products(owner){return records.filter(p=>owner||p.status==='published');},
    async product(id){return records.find(p=>p.id===id);},
    async save(p){records=[p];return p;},async imageExists(){return true;},async imageUrl(){return 'https://example.supabase.co/image';},
    async checkout(snapshot){return {url:'https://checkout.stripe.com/test',snapshot};},
    webhookSecret:()=> 'whsec_test',liveMode:()=>false,async recordPaid(){},...overrides };
}
function request(path, data, headers={}) {return new Request(`https://store.example/api/retail/${path}`, {method:'POST',headers:{origin:'https://store.example','Content-Type':'application/json',...headers},body:JSON.stringify(data)});}

test('product publishing requires a photo and valid unique variants',()=>{
  assert.equal(productInput(product).price_cents,3450);
  assert.throws(()=>productInput({...product,image_path:''}),/photo/);
  assert.throws(()=>productInput({...product,variants:[product.variants[0],product.variants[0]]}),/duplicate/);
  assert.throws(()=>productInput({...product,image_path:'https://evil.example/x.svg'}),/photo/);
  assert.throws(()=>productInput({...product,price_cents:NaN}),/Price/);
  assert.throws(()=>productInput({...product,price_cents:3450.5}),/Price/);
});
test('checkout uses current server price and refuses unavailable, archived, stale and fractional selections',()=>{
  assert.equal(selection(product,{...choice,price_cents:1}).subtotal_cents,6900);
  for(const patch of [{quantity:0},{quantity:21},{quantity:1.5},{size:'M'},{color:'Red'},{expected_price_cents:1}]) assert.throws(()=>selection(product,{...choice,...patch}));
  assert.throws(()=>selection({...product,status:'draft'},choice));
});
test('owner access requires authentication and a trusted storefront or owner origin',async()=>{
  const app=createApp(fake({
    origins:()=>['https://store.example','https://owner.example'],
    async login(){return {token:'owner',expires:3600};}
  }));
  assert.equal((await app(request('login',{email:'owner@example.com',password:'test'},{origin:'https://owner.example'}))).status,200);
  assert.equal((await app(request('login',{email:'owner@example.com',password:'test'},{origin:'https://evil.example'}))).status,403);
  assert.equal((await app(request('product',product))).status,401);
  assert.equal((await app(request('product',product,{cookie:'retail_session=owner',origin:'https://evil.example'}))).status,403);
  assert.equal((await app(request('product',product,{cookie:'retail_session=owner',origin:'https://owner.example'}))).status,200);
  assert.equal((await app(request('product',product,{cookie:'retail_session=owner'}))).status,200);
});
test('draft publish archive cycle controls the public catalog',async()=>{
  const app=createApp(fake());
  for(const [status,count] of [['draft',0],['published',1],['archived',0]]) {
    assert.equal((await app(request('product',{...product,status},{cookie:'retail_session=owner'}))).status,200);
    const res=await app(new Request('https://store.example/api/retail/catalog'));
    const data=await res.json();assert.equal(data.products.length,count);
    if(count) assert.equal(data.products[0].image_path,undefined);
  }
});
test('upload rejects unauthorized, oversized and disguised SVG input',async()=>{
  const app=createApp(fake());
  const upload=(bytes,cookie='retail_session=owner')=>app(new Request('https://store.example/api/retail/upload',{method:'POST',headers:{origin:'https://store.example','Content-Type':'image/png',cookie},body:bytes}));
  assert.equal((await upload('<svg></svg>','')).status,401);
  assert.equal((await upload('<svg></svg>')).status,400);
  assert.equal((await upload(Buffer.alloc(4*1024*1024+1))).status,413);
});
test('checkout stays closed when configuration is incomplete',async()=>{
  const app=createApp(fake({gaps:()=>['missing webhook'],checkout:()=>{throw Error('should never be called');}}));
  assert.equal((await app(request('checkout',choice))).status,503);
  assert(checkoutGaps(()=>undefined).includes('STRIPE_WEBHOOK_SECRET'));
  const env={SUPABASE_URL:'https://db.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret',STRIPE_SECRET_KEY:'sk_live_example',STRIPE_WEBHOOK_SECRET:'whsec_example',RETAIL_ORIGIN:'https://store.example',RETAIL_SHIPPING_RATE:'shr_example',RETAIL_COUNTRIES:'US',RETAIL_SHIPPING_NOTE:'Shipping note',RETAIL_RETURNS_NOTE:'Returns note',RETAIL_AUTOMATIC_TAX:'false',RETAIL_CHECKOUT_ENABLED:'true'};
  assert(checkoutGaps(k=>env[k]).includes('RETAIL_ALLOW_LIVE'));
  assert(checkoutGaps(k=>k==='RETAIL_SUCCESS_URL'?'http://unsafe.example':env[k]).includes('HTTPS retail success URL'));
});
test('webhook signature validates rotation, timestamp and exact body',()=>{
  const raw='{"a":1}',t=Math.floor(Date.now()/1000),sig=createHmac('sha256','secret').update(`${t}.${raw}`).digest('hex');
  assert(verifySignature(raw,`t=${t},v1=${'0'.repeat(64)},v1=${sig}`,'secret'));
  assert(!verifySignature(raw+' ',`t=${t},v1=${sig}`,'secret'));
  assert(!verifySignature(raw,`t=${t},v1=${sig}`,'secret',Date.now()+301000));
  assert(!verifySignature(raw,`t=NaN,v1=${sig}`,'secret'));
});
test('webhook ignores unpaid events and retries a failed order write',async()=>{
  let recorded=0;
  const driver=fake({async recordPaid(){recorded++;throw Error('database unavailable');}}),app=createApp(driver);
  async function webhook(payment_status,valid=true){
    const payload={type:'checkout.session.completed',data:{object:{livemode:false,payment_status,metadata:{source:'skrewu-retail',retail_order_id:requestId}}}};
    const raw=JSON.stringify(payload),t=Math.floor(Date.now()/1000),sig=createHmac('sha256',valid?'whsec_test':'wrong').update(`${t}.${raw}`).digest('hex');
    return app(new Request('https://store.example/api/retail/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${sig}`},body:raw}));
  }
  assert.equal((await webhook('paid',false)).status,401);assert.equal(recorded,0);
  assert.equal((await webhook('unpaid')).status,200);assert.equal(recorded,0);
  assert.equal((await webhook('paid')).status,500);assert.equal(recorded,1);
});
test('Stripe request follows durable snapshot and uses a stable idempotency key',async()=>{
  const calls=[],snapshot=selection(product,choice);
  const env={SUPABASE_URL:'https://db.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret',RETAIL_ORIGIN:'https://store.example',RETAIL_SUCCESS_URL:'https://orders.example',RETAIL_COUNTRIES:'US,CA',RETAIL_SHIPPING_RATE:'shr_test',RETAIL_AUTOMATIC_TAX:'false',STRIPE_SECRET_KEY:'sk_test_example'};
  const driver=production(k=>env[k],async(url,opts)=>{
    calls.push({url,opts});
    if(url.includes('api.stripe.com'))return Response.json({id:'cs_test_1',url:'https://checkout.stripe.com/test'});
    if(opts.method==='POST')return new Response(null,{status:201});
    return Response.json([{snapshot,status:'pending',created_at:new Date().toISOString()}]);
  });
  await driver.checkout(snapshot,requestId);
  assert(calls[0].url.includes('retail_orders'));assert(calls[2].url.includes('api.stripe.com'));
  assert.equal(calls[2].opts.headers['Idempotency-Key'],`retail-${requestId}`);
  assert.equal(calls[2].opts.body.get('success_url'),'https://orders.example/?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(calls[2].opts.body.get('line_items[0][price_data][unit_amount]'),'3450');
  assert.equal(calls[2].opts.body.get('shipping_address_collection[allowed_countries][1]'),'CA');
});
test('server checks approved owner identity rather than user-editable metadata',async()=>{
  const driver=production(k=>({SUPABASE_URL:'https://db.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret',RETAIL_OWNER_IDS:id}[k]),async()=>Response.json({id:'other-user',user_metadata:{owner:true}}));
  await assert.rejects(driver.authenticate('valid-but-not-owner'),/cannot manage/);
});
test('existing tool webhook ignores retail payments to avoid duplicate tool orders',async()=>{
  const names=['STRIPE_WEBHOOK_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const old=names.map(k=>process.env[k]);
  try {
    process.env.STRIPE_WEBHOOK_SECRET='whsec_test';process.env.SUPABASE_URL='https://unused.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='not-a-real-key';
    const handler=createRequire(import.meta.url)('../../internal/netlify/functions/stripe-order.js').handler;
    const raw=JSON.stringify({type:'checkout.session.completed',data:{object:{payment_status:'paid',metadata:{source:'skrewu-retail'}}}});
    const t=Math.floor(Date.now()/1000),sig=createHmac('sha256','whsec_test').update(`${t}.${raw}`).digest('hex');
    const response=await handler({httpMethod:'POST',body:raw,headers:{'stripe-signature':`t=${t},v1=${sig}`}});
    assert.equal(response.statusCode,200);assert.equal(JSON.parse(response.body).ignored,'retail receiver owns this order');
  } finally {names.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});

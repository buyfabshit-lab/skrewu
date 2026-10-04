import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { HttpError, productInput, selection } from '../server/domain.mjs';
import { production } from '../server/production.mjs';
import { acceptsDesignMessage, openShopDraft, publishToShop, readDesignTransfer } from '../public/design-bridge.js';
import { importDesign } from '../public/design-import.js';

const id = '11111111-1111-4111-8111-111111111111';
const artworkId = '22222222-2222-4222-8222-222222222222';
const transferId = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const spec = { transfer_id: transferId, source_design_id: 'original-42', placement: 'front', width_inches: 12, height_inches: 14 };
const shirt = { id, name: 'Owner test shirt', description: 'Design transfer test', garment: 'Cotton tee',
  price_cents: 3000, status: 'draft', image_path: `${id}.png`, artwork_path: `${artworkId}.png`, design_spec: spec,
  variants: [{ size: 'L', color: 'Black', available: true }] };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS2kAAAAASUVORK5CYII=', 'base64');
const payload = () => ({ type: 'skrewu:design', version: 1, transfer_id: transferId, name: shirt.name,
  preview: new Blob([png], { type: 'image/png' }), artwork: new Blob([png], { type: 'image/png' }),
  print: { placement: 'front', width_inches: 12, height_inches: 14 }, variants: shirt.variants });

test('designer transfer is bound to the exact opener, configured origin and transfer ID', () => {
  const opener = {}, connection = { opener, origins: ['https://designer.example'], designerOrigin: 'https://designer.example', transferId };
  const event = { source: opener, origin: 'https://designer.example', data: { transfer_id: transferId } };
  assert(acceptsDesignMessage(event, connection));
  for (const patch of [{ source: {} }, { origin: 'https://evil.example' }, { data: { transfer_id: requestId } }]) {
    assert.equal(acceptsDesignMessage({ ...event, ...patch }, connection), false);
  }
  assert.equal(acceptsDesignMessage(event, { ...connection, origins: [] }), false);
  assert.equal(acceptsDesignMessage(event, { ...connection, opener: null }), false);
});

test('transfer keeps binary originals, rejects oversized files and does not import a publishing command', () => {
  const input = payload(), result = readDesignTransfer({ ...input, status: 'published', api_key: 'must-not-copy' });
  assert.equal(result.artwork, input.artwork);
  assert.equal(result.preview, input.preview);
  assert.equal(result.status, undefined); assert.equal(result.api_key, undefined);
  assert.equal(result.design_spec.width_inches, 12);
  assert.throws(() => readDesignTransfer({ ...input, artwork: new Blob([Buffer.alloc(4 * 1024 * 1024 + 1)], { type: 'image/png' }) }), /4 MB/);
  assert.throws(() => readDesignTransfer({ ...input, artwork: 'https://remote.example/file.png' }), /original print/);
  assert.throws(() => readDesignTransfer({ ...input, print: { ...input.print, width_inches: NaN } }), /width/);
  assert.throws(() => productInput({ ...shirt, artwork_path: '' }), /original print/);
});

test('upload and draft save retain original bytes while the public catalog excludes production artwork', async () => {
  const files = new Map(), records = new Map(); let uploadIndex = 0;
  const driver = {
    preview: false, origin: () => 'https://shop.example', gaps: () => [], policies: () => ({}), designerOrigins: () => ['https://designer.example'],
    async authenticate(token) { if (token !== 'owner') throw new HttpError(401, 'Sign in'); },
    async upload(bytes, type) { const path = `${[id, artworkId][uploadIndex++]}.${type.ext}`; files.set(path, Buffer.from(bytes)); return path; },
    async imageExists(path) { return files.has(path); }, async imageUrl(path) { return path ? `https://private.example/${path}` : null; },
    async save(product) { records.set(product.id, product); return product; },
    async product(id) { return records.get(id); },
    async products(owner) { return [...records.values()].filter(p => owner || p.status === 'published'); }
  };
  const app = createApp(driver);
  const request = (path, body, contentType = 'application/json', cookie = 'retail_session=owner') => new Request(`https://shop.example/api/retail/${path}`,
    { method: 'POST', headers: { origin: 'https://shop.example', cookie, 'Content-Type': contentType }, body });
  assert.equal((await app(request('upload', png, 'image/png', ''))).status, 401);
  for (const file of [png, Buffer.concat([png, Buffer.from('original-print-test')])]) {
    assert.equal((await app(request('upload', file, 'image/png'))).status, 200);
  }
  assert.deepEqual(files.get(`${artworkId}.png`), Buffer.concat([png, Buffer.from('original-print-test')]));
  assert.equal((await app(request('product', JSON.stringify(shirt)))).status, 200);
  let catalog = await (await app(new Request('https://shop.example/api/retail/catalog'))).json();
  assert.equal(catalog.products.length, 0);
  assert.equal((await app(request('product', JSON.stringify({ ...shirt, status: 'published' })))).status, 200);
  catalog = await (await app(new Request('https://shop.example/api/retail/catalog'))).json();
  assert.equal(catalog.products[0].name, shirt.name);
  for (const field of ['artwork_path', 'artwork_url', 'design_spec']) assert.equal(catalog.products[0][field], undefined);
  const owner = await (await app(new Request('https://shop.example/api/retail/owner', { headers: { cookie: 'retail_session=owner' } }))).json();
  assert.equal(owner.products[0].artwork_path, shirt.artwork_path);
  assert.equal(owner.products[0].artwork_url, `https://private.example/${shirt.artwork_path}`);
  assert.deepEqual(owner.designerOrigins, ['https://designer.example']);
  const { artwork_path, design_spec, ...oldEditorProduct } = shirt;
  assert.equal((await app(request('product', JSON.stringify({ ...oldEditorProduct, status: 'published', name: 'Changed in an older tab' })))).status, 200);
  assert.equal(records.get(id).artwork_path, artwork_path); assert.deepEqual(records.get(id).design_spec, design_spec);
  assert.equal((await app(request('product', JSON.stringify({ ...shirt, artwork_path: `${requestId}.png` })))).status, 400);
});

test('checkout copies server-owned print details and accepts a JSONB snapshot with reordered object keys', async () => {
  const choice = { size: 'L', color: 'Black', quantity: 1, expected_price_cents: 3000,
    artwork_path: 'customer-overwrite.png', design_spec: { placement: 'back' } };
  const snapshot = selection({ ...shirt, status: 'published' }, choice);
  assert.equal(snapshot.artwork_path, shirt.artwork_path); assert.deepEqual(snapshot.design_spec, spec);
  const stored = { ...snapshot, design_spec: Object.fromEntries(Object.entries(spec).reverse()) };
  let stripeCalls = 0;
  const values = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-only', STRIPE_SECRET_KEY: 'sk_test_example',
    RETAIL_ORIGIN: 'https://shop.example', RETAIL_COUNTRIES: 'US', RETAIL_SHIPPING_RATE: 'shr_test', RETAIL_AUTOMATIC_TAX: 'false' };
  const driver = production(key => values[key], async (url, options) => {
    if (url.includes('api.stripe.com')) { stripeCalls++; return Response.json({ url: 'https://checkout.stripe.com/test' }); }
    if (options.method === 'POST') return new Response(null, { status: 201 });
    return Response.json([{ snapshot: stored, status: 'pending', created_at: new Date().toISOString() }]);
  });
  await driver.checkout(snapshot, requestId); assert.equal(stripeCalls, 1);
  await assert.rejects(driver.checkout({ ...snapshot, artwork_path: `${requestId}.png` }, requestId), /selection changed/);
  assert.equal(stripeCalls, 1);
});

test('exporter sends only after a trusted shop handshake and sends original blobs once', async () => {
  const previous = globalThis.window, listeners = new Set(); let target, exports = 0, sends = 0, transferred;
  const popup = { closed: false, postMessage(data, origin) {
    sends++; transferred = data; assert.equal(origin, 'https://shop.example');
    queueMicrotask(() => listeners.forEach(listener => listener({ source: popup, origin, data: { type: 'skrewu:received', transfer_id: data.transfer_id } })));
  } };
  globalThis.window = { location: { origin: 'https://designer.example' }, open(url) { target = new URL(url); return popup; },
    addEventListener(type, listener) { listeners.add(listener); }, removeEventListener(type, listener) { listeners.delete(listener); } };
  try {
    const input = payload();
    const pending = openShopDraft({ shopUrl: 'https://shop.example', timeoutMs: 1000, getDesign: async () => { exports++; return input; } });
    const transfer_id = new URLSearchParams(target.hash.slice(1)).get('transfer');
    for (const listener of listeners) await listener({ source: popup, origin: 'https://evil.example', data: { type: 'skrewu:ready', transfer_id } });
    assert.equal(exports, 0);
    for (const listener of listeners) await listener({ source: popup, origin: 'https://shop.example', data: { type: 'skrewu:ready', transfer_id } });
    assert.equal((await pending).status, 'review'); assert.equal(exports, 1); assert.equal(sends, 1);
    assert.equal(transferred.artwork, input.artwork); assert.equal(listeners.size, 0);
  } finally { globalThis.window = previous; }
});

test('an export that finishes after the transfer timeout is not sent', async () => {
  const previous = globalThis.window, listeners = new Set(); let target, finishExport, sends = 0;
  const popup = { closed: false, postMessage() { sends++; } };
  globalThis.window = { location: { origin: 'https://designer.example' }, open(url) { target = new URL(url); return popup; },
    addEventListener(type, listener) { listeners.add(listener); }, removeEventListener(type, listener) { listeners.delete(listener); } };
  try {
    const pending = openShopDraft({ shopUrl: 'https://shop.example', timeoutMs: 10, getDesign: () => new Promise(resolve => { finishExport = resolve; }) });
    const rejected = assert.rejects(pending, /timed out/);
    const transfer_id = new URLSearchParams(target.hash.slice(1)).get('transfer');
    const receiving = [...listeners][0]({ source: popup, origin: 'https://shop.example', data: { type: 'skrewu:ready', transfer_id } });
    await rejected; finishExport(payload()); await receiving;
    assert.equal(sends, 0); assert.equal(listeners.size, 0);
  } finally { globalThis.window = previous; }
});

test('direct publish saves once after every print upload, while review transfers do not create listings', async () => {
  const input = readDesignTransfer({ ...payload(), intent: 'publish', description: shirt.description, garment: shirt.garment, price_cents: 3000,
    additional_prints: [{ artwork: new Blob([png], { type: 'image/png' }), print: { placement: 'back', width_inches: 8, height_inches: 10 } }] });
  let uploads = 0, saves = 0; const order = [];
  const dependencies = { upload: async file => { order.push('upload'); uploads++; return { image_path: `${[id, artworkId, requestId][uploads - 1]}.png`, image_url: 'https://private.example/file' }; },
    saveProduct: async product => { order.push('save'); saves++; return { product: productInput(product) }; } };
  const published = await importDesign(input, dependencies);
  assert.equal(published.id, transferId); assert.equal(published.status, 'published');
  assert.deepEqual(order, ['upload', 'upload', 'upload', 'save']); assert.equal(saves, 1);
  assert.equal(published.design_spec.additional_prints[0].artwork_path, `${requestId}.png`);
  const snapshot = selection(published, { size: 'L', color: 'Black', quantity: 1, expected_price_cents: 3000 });
  assert.deepEqual(snapshot.design_spec.additional_prints, published.design_spec.additional_prints);
  uploads = 0; await importDesign({ ...input, intent: 'review' }, dependencies); assert.equal(saves, 1);
  let index = 0;
  await assert.rejects(importDesign(input, { ...dependencies, upload: async () => { if (++index === 3) throw new Error('Back artwork upload failed'); return { image_path: `${id}.png` }; } }), /Back artwork/);
  assert.equal(saves, 1);
  assert.throws(() => readDesignTransfer({ ...payload(), intent: 'publish' }), /before publishing/);
  assert.throws(() => readDesignTransfer({ ...payload(), additional_prints: [{ artwork: input.artwork, print: payload().print }] }), /one print file/);
});

test('the publishing sender requires a capable shop and a saved product receipt', async () => {
  const previous = globalThis.window, listeners = new Set(); let target, exports = 0;
  const popup = { closed: false, postMessage(data, origin) {
    assert.equal(data.intent, 'publish');
    queueMicrotask(() => listeners.forEach(listener => listener({ source: popup, origin, data: { type: 'skrewu:received',
      transfer_id: data.transfer_id, status: 'published', product_id: data.transfer_id } })));
  } };
  globalThis.window = { location: { origin: 'https://designer.example' }, open(url) { target = new URL(url); return popup; },
    addEventListener(type, listener) { listeners.add(listener); }, removeEventListener(type, listener) { listeners.delete(listener); } };
  const getDesign = async () => { exports++; return { ...payload(), description: shirt.description, garment: shirt.garment, price_cents: 3000 }; };
  try {
    let pending = publishToShop({ shopUrl: 'https://shop.example', timeoutMs: 1000, getDesign });
    let transfer_id = new URLSearchParams(target.hash.slice(1)).get('transfer');
    const rejected = assert.rejects(pending, /Update the SKREWU/);
    await [...listeners][0]({ source: popup, origin: 'https://shop.example', data: { type: 'skrewu:ready', transfer_id } });
    await rejected; assert.equal(exports, 0);
    pending = publishToShop({ shopUrl: 'https://shop.example', timeoutMs: 1000, getDesign });
    transfer_id = new URLSearchParams(target.hash.slice(1)).get('transfer');
    await [...listeners][0]({ source: popup, origin: 'https://shop.example', data: { type: 'skrewu:received', transfer_id, status: 'published', product_id: transfer_id } });
    assert.equal(exports, 0);
    await [...listeners][0]({ source: popup, origin: 'https://shop.example', data: { type: 'skrewu:ready', transfer_id, capabilities: ['publish'] } });
    assert.equal((await pending).product_id, transfer_id); assert.equal(exports, 1);
  } finally { globalThis.window = previous; }
});

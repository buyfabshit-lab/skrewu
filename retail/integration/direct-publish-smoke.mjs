// Disposable local HTTP review only. This adapter cannot contact production.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readDesignTransfer } from '../public/design-bridge.js';
import { importDesign } from '../public/design-import.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:4188';
const child = spawn(process.execPath, ['preview.mjs'], { cwd: root, env: { ...process.env, PORT: '4188' }, stdio: ['ignore', 'pipe', 'pipe'] });
let cookie = '', published;
async function request(path, options = {}) {
  const response = await fetch(`${origin}/api/retail/${path}`, { ...options, headers: { origin, cookie, ...options.headers } });
  const data = await response.json(); assert(response.ok, data.error || `HTTP ${response.status}`); return { response, data };
}
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local review startup timed out')), 8000);
    child.once('error', reject); child.once('exit', code => reject(new Error(`Local review exited: ${code}`)));
    child.stdout.on('data', data => { if (data.toString().includes('SKREW U local review')) { clearTimeout(timer); resolve(); } });
  });
  const login = await request('login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'review@localhost', password: 'local-review' }) });
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS2kAAAAASUVORK5CYII=', 'base64');
  const front = Buffer.concat([png, Buffer.from('front-original')]), back = Buffer.concat([png, Buffer.from('back-original')]);
  const input = readDesignTransfer({ type: 'skrewu:design', version: 1, transfer_id: randomUUID(), intent: 'publish',
    name: 'Local direct-publish test', description: 'Synthetic validation fixture', garment: 'Test tee', price_cents: 3000,
    variants: [{ size: 'L', color: 'Black', available: true }], preview: new Blob([png], { type: 'image/png' }),
    artwork: new Blob([front], { type: 'image/png' }), print: { placement: 'front', width_inches: 12, height_inches: 14 },
    additional_prints: [{ artwork: new Blob([back], { type: 'image/png' }), print: { placement: 'back', width_inches: 8, height_inches: 10 } }] });
  published = await importDesign(input, {
    upload: async file => (await request('upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file })).data,
    saveProduct: async product => (await request('product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product) })).data
  });
  assert.equal(published.status, 'published');
  const publicProduct = (await request('catalog')).data.products.find(p => p.id === published.id); assert(publicProduct);
  for (const field of ['artwork_path', 'artwork_url', 'design_spec', 'additional_artwork_urls']) assert.equal(publicProduct[field], undefined);
  const ownerProduct = (await request('owner')).data.products.find(p => p.id === published.id);
  for (const [url, bytes] of [[ownerProduct.artwork_url, front], [ownerProduct.additional_artwork_urls[0].url, back]]) {
    assert.deepEqual(Buffer.from(await (await fetch(`${origin}${url}`)).arrayBuffer()), bytes);
  }
  console.log('PASS: direct HTTP publication, front/back original byte preservation, public catalog privacy and owner access. No live services or payments used.');
} finally {
  try {
    if (published) await request('product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...published, status: 'archived' }) });
  } finally { child.kill(); }
}

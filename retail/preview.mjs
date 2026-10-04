// LOCAL-ONLY REVIEW ADAPTER. Not imported by or published to Netlify.
// All writes stay in .preview-data; there is no Stripe or Supabase connection.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from './server/app.mjs';
import { ensure } from './server/domain.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(root, '.preview-data');
const port = Number(process.env.PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
await mkdir(resolve(dataDir, 'images'), { recursive: true });
const dataFile = resolve(dataDir, 'products.json');
let products;
try { products = JSON.parse(await readFile(dataFile, 'utf8')); } catch (e) {
  if (e.code !== 'ENOENT') throw e;
  products = ['black','bone','rust'].map((sample, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`, name: ['The statement tee','The off-script tee','The after-hours tee'][i],
    description: 'Example product for reviewing the store. Replace this with your own shirt photo, description, and price before selling.',
    garment: 'Sample shirt information. Add the actual blank, fabric, fit and care instructions for your shirt.',
    price_cents: [3000,3200,3500][i], status: 'published', image_path: '', sample,
    variants: ['S','M','L','XL','2XL'].map(size => ({ size, color: ['Black','Bone','Rust'][i], available: size !== 'S' || i !== 2 })),
    updated_at: new Date().toISOString()
  }));
  await writeFile(dataFile, JSON.stringify(products, null, 2));
}
const sessions = new Set();
let writeQueue = Promise.resolve();
const driver = {
  preview: true, origin: () => origin, designerOrigins: () => [origin], gaps: () => ['Local review: payments disabled'], policies: () => ({ shipping: '', returns: '' }),
  async login() { const token = randomUUID(); sessions.add(token); return { token, expires: 3600 }; },
  async authenticate(token) { ensure(sessions.has(token), 'Sign in to manage your shirts.', 401); return { id: 'local-review' }; },
  async logout(token) { sessions.delete(token); },
  async products(owner = false) { return products.filter(p => owner || p.status === 'published'); },
  async product(id) { return products.find(p => p.id === id); },
  async save(p) {
    const index = products.findIndex(x => x.id === p.id);
    if (index < 0) products.unshift(p); else products[index] = p;
    const snapshot = JSON.stringify(products, null, 2);
    writeQueue = writeQueue.then(() => writeFile(dataFile, snapshot)); await writeQueue;
    return p;
  },
  async imageExists(path) { try { await readFile(resolve(dataDir, 'images', path)); return true; } catch { return false; } },
  async upload(bytes, type) { const name = `${randomUUID()}.${type.ext}`; await writeFile(resolve(dataDir, 'images', name), bytes); return name; },
  async imageUrl(path) { return path ? `/preview-images/${path}` : null; },
  webhookSecret: () => '', liveMode: () => false,
  async checkout() { throw Error('Payments are not part of local review.'); },
  async recordPaid() { throw Error('Payments are not part of local review.'); }
};
const app = createApp(driver);
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };
const server = http.createServer(async (req, res) => {
  try {
    // Prevent cross-origin websites using DNS rebinding to reach the local desk.
    if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); res.end('Local preview only.'); return; }
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/retail/')) {
      const chunks = []; let length = 0;
      for await (const c of req) { length += c.length; if (length > 4 * 1024 * 1024 + 1) { res.writeHead(413); res.end(); return; } chunks.push(c); }
      const options = { method: req.method, headers: req.headers };
      if (!['GET','HEAD'].includes(req.method)) options.body = Buffer.concat(chunks);
      const response = await app(new Request(url, options));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const image = /^\/preview-images\/([0-9a-f-]{36}\.(?:png|jpg|webp))$/.exec(url.pathname);
    const harness = { '/design-connection-review.html': 'review.html', '/design-connection-review.js': 'review.js' }[url.pathname];
    const file = image ? resolve(dataDir, 'images', image[1]) : harness ? resolve(root, 'integration', harness)
      : resolve(root, 'public', url.pathname === '/' ? 'index.html' : `.${url.pathname}`);
    if (!image && !harness && !file.startsWith(resolve(root, 'public') + '\\') && !file.startsWith(resolve(root, 'public') + '/')) { res.writeHead(404); res.end(); return; }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(content);
  } catch (e) { res.writeHead(e.code === 'ENOENT' ? 404 : 500); res.end('Could not load this page.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`SKREW U local review: ${origin}\nOwner desk: ${origin}/owner.html\nNo payments. Changes saved locally.`));

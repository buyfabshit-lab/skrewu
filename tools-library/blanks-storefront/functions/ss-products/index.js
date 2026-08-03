/* ============================================================
   ss-products — S&S Activewear blanks feed
   Zero-dependency Node function (Node 18+ for global fetch/Buffer).

   Fetches the S&S Activewear v2 styles catalog with Basic auth, normalizes
   it to a small "blanks" shape the storefront can render, and serves it with
   CORS. Credentials are ENV ONLY and stay server-side — the browser never
   sees the S&S account/key.

   Run standalone:   node index.js            (listens on $PORT, default 8787)
   Or import:        import { fetchBlanks } from './index.js'
   ============================================================ */

import http from 'node:http';

// Config with defaults; credentials are read at call time (below) so the values
// are picked up at runtime — correct for serverless and testable.
const SS_API_BASE    = () => process.env.SS_API_BASE || 'https://api.ssactivewear.com/v2';
const SS_CDN_BASE    = () => process.env.SS_CDN_BASE || 'https://cdn.ssactivewear.com/';
const ALLOWED_ORIGIN = () => process.env.ALLOWED_ORIGIN || '*';
const PORT           = process.env.PORT || 8787;
const hasCreds       = () => !!(process.env.SS_ACCOUNT_NUMBER && process.env.SS_API_KEY);

function imageUrl(pathish) {
  if (!pathish) return null;
  if (/^https?:\/\//i.test(pathish)) return pathish;
  return SS_CDN_BASE().replace(/\/$/, '') + '/' + String(pathish).replace(/^\//, '');
}

/**
 * Fetch + normalize S&S styles into blanks.
 * @param {{search?:string, brand?:string, category?:string, limit?:number}} opts
 * @returns {Promise<Array>} normalized blanks
 */
export async function fetchBlanks(opts = {}) {
  const ACCOUNT = process.env.SS_ACCOUNT_NUMBER;
  const API_KEY = process.env.SS_API_KEY;
  if (!ACCOUNT || !API_KEY) {
    throw new Error('SS_ACCOUNT_NUMBER and SS_API_KEY must be set in the environment');
  }
  const auth = 'Basic ' + Buffer.from(`${ACCOUNT}:${API_KEY}`).toString('base64');
  const res = await fetch(`${SS_API_BASE()}/styles/`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`S&S styles request failed: ${res.status} ${body.slice(0, 160)}`);
  }
  let styles = await res.json();
  if (!Array.isArray(styles)) styles = styles?.styles || styles?.data || [];

  const q = (opts.search || '').toLowerCase();
  const brand = (opts.brand || '').toLowerCase();
  const cat = (opts.category || '').toLowerCase();

  let rows = styles.filter(s => {
    if (brand && !String(s.brandName || '').toLowerCase().includes(brand)) return false;
    if (cat && !String(s.baseCategory || '').toLowerCase().includes(cat)) return false;
    if (q) {
      const hay = `${s.brandName || ''} ${s.styleName || ''} ${s.title || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 60;
  rows = rows.slice(0, limit);

  return rows.map(s => ({
    id: String(s.styleID ?? s.styleId ?? s.styleName ?? s.partNumber ?? ''),
    styleName: s.styleName || s.partNumber || '',
    brand: s.brandName || '',
    title: s.title || s.styleName || '',
    category: s.baseCategory || '',
    image: imageUrl(s.styleImage || s.brandImage),
  })).filter(b => b.id);
}

/* ── Framework-agnostic-ish handler for a query object ── */
export async function handler(query = {}) {
  const blanks = await fetchBlanks({
    search: query.search, brand: query.brand, category: query.category, limit: query.limit,
  });
  return { blanks, count: blanks.length, source: 'ssactivewear' };
}

/* ── Standalone HTTP server (only when run directly) ── */
function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN(),
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    ...extra,
  };
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders()); return res.end(); }

    if (url.pathname === '/health') {
      res.writeHead(200, corsHeaders({ 'Content-Type': 'application/json' }));
      return res.end(JSON.stringify({ ok: true, credentials: hasCreds(), base: SS_API_BASE() }));
    }

    if (['/', '/ss-products', '/products', '/blanks'].includes(url.pathname)) {
      try {
        const out = await handler({
          search: url.searchParams.get('search'),
          brand: url.searchParams.get('brand'),
          category: url.searchParams.get('category'),
          limit: url.searchParams.get('limit'),
        });
        res.writeHead(200, corsHeaders({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }));
        return res.end(JSON.stringify(out));
      } catch (e) {
        console.error('[ss-products]', e.message);
        res.writeHead(502, corsHeaders({ 'Content-Type': 'application/json' }));
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    res.writeHead(404, corsHeaders({ 'Content-Type': 'application/json' }));
    res.end(JSON.stringify({ error: 'not found' }));
  });
}

// Run only if invoked directly (node index.js), not when imported.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  createServer().listen(PORT, () => {
    console.log(`ss-products listening on :${PORT}  (credentials ${hasCreds() ? 'present' : 'MISSING'})`);
  });
}

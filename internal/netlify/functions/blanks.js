/**
 * blanks — the supplier catalogue, browsable by brand and category.
 *
 * The normalising here matches `tools-library/blanks-storefront/functions/
 * ss-products/index.js`, which is the standalone version of the same feed.
 * If S&S changes a field name, both need the change — they are two doors onto
 * one supplier, not two different ideas.
 *
 * Netlify environment variables:
 *   SS_ACCOUNT_NUMBER, SS_API_KEY   from your S&S Activewear account
 *
 * GET /api/blanks?brand=bella&category=tank&search=&limit=60
 *   -> { ok, live, brands:[…], categories:[…], blanks:[…] }
 *
 * `live` is false when there are no keys yet: a short stand-in list comes back
 * so the page can be looked at, and it says plainly that it isn't the real
 * catalogue. Nothing here ever pretends demo data is a live feed.
 */

const SS_BASE = 'https://api.ssactivewear.com/v2';

/* Enough to see how the page behaves before the keys land. Style numbers are
   real so they're recognisable; everything else comes from S&S when it's on. */
const STAND_IN = [
  { id: 'bc-3001',  brand: 'Bella+Canvas', style: '3001',  title: 'Unisex Jersey Tee',   category: 'T-Shirts' },
  { id: 'bc-3480',  brand: 'Bella+Canvas', style: '3480',  title: 'Unisex Jersey Tank',  category: 'Tanks' },
  { id: 'bc-6400',  brand: 'Bella+Canvas', style: '6400',  title: 'Women’s Relaxed Tee', category: 'T-Shirts' },
  { id: 'bc-8800',  brand: 'Bella+Canvas', style: '8800',  title: 'Women’s Flowy Tank',  category: 'Tanks' },
  { id: 'gil-5000', brand: 'Gildan',       style: '5000',  title: 'Heavy Cotton Tee',    category: 'T-Shirts' },
  { id: 'gil-18500',brand: 'Gildan',       style: '18500', title: 'Heavy Blend Hoodie',  category: 'Fleece' },
  { id: 'cc-1717',  brand: 'Comfort Colors', style: '1717', title: 'Garment-Dyed Tee',   category: 'T-Shirts' },
  { id: 'nl-3600',  brand: 'Next Level',   style: '3600',  title: 'Cotton Crew Tee',     category: 'T-Shirts' },
  { id: 'nl-6733',  brand: 'Next Level',   style: '6733',  title: 'Triblend Racerback',  category: 'Tanks' },
  { id: 'itc-4500', brand: 'Independent Trading', style: 'SS4500', title: 'Midweight Hoodie', category: 'Fleece' },
];

function json(statusCode, body) {
  return {
    statusCode,
    // Cache the catalogue, never an error — see the note in shop.js.
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': statusCode === 200 ? 'public, max-age=600' : 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function imageUrl(path) {
  if (!path) return null;
  const s = String(path);
  if (/^https?:\/\//i.test(s)) return s;
  return `https://cdn.ssactivewear.com/${s.replace(/^\/+/, '')}`;
}

function normalise(s) {
  return {
    id: String(s.styleID ?? s.styleId ?? s.styleName ?? s.partNumber ?? ''),
    style: s.styleName || s.partNumber || '',
    brand: s.brandName || '',
    title: s.title || s.styleName || '',
    category: s.baseCategory || s.categoryName || '',
    image: imageUrl(s.styleImage || s.brandImage),
  };
}

function summarise(rows) {
  const brands = new Map();
  const cats = new Map();
  rows.forEach(r => {
    if (r.brand) brands.set(r.brand, (brands.get(r.brand) || 0) + 1);
    if (r.category) cats.set(r.category, (cats.get(r.category) || 0) + 1);
  });
  const sort = (m) => [...m.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return { brands: sort(brands), categories: sort(cats) };
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const brand = String(q.brand || '').toLowerCase();
  const category = String(q.category || '').toLowerCase();
  const search = String(q.search || '').toLowerCase();
  const limit = Math.min(300, Math.max(1, Number(q.limit) || 60));

  const account = process.env.SS_ACCOUNT_NUMBER;
  const apiKey = process.env.SS_API_KEY;

  const filter = (rows) => rows.filter(r => {
    if (brand && !String(r.brand).toLowerCase().includes(brand)) return false;
    if (category && !String(r.category).toLowerCase().includes(category)) return false;
    if (search) {
      const hay = `${r.brand} ${r.style} ${r.title}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  if (!account || !apiKey) {
    const rows = filter(STAND_IN);
    return json(200, {
      ok: true,
      live: false,
      why: 'These are stand-ins. Add SS_ACCOUNT_NUMBER and SS_API_KEY in Netlify for the real catalogue.',
      ...summarise(STAND_IN),
      blanks: rows.slice(0, limit),
    });
  }

  let styles;
  try {
    const res = await fetch(`${SS_BASE}/styles/`, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${account}:${apiKey}`).toString('base64'),
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return json(502, { ok: false, error: `S&S said ${res.status}: ${body.slice(0, 160)}` });
    }
    styles = await res.json();
    if (!Array.isArray(styles)) styles = styles?.styles || styles?.data || [];
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }

  const all = styles.map(normalise).filter(r => r.style);
  const rows = filter(all);
  return json(200, {
    ok: true,
    live: true,
    ...summarise(all),
    blanks: rows.slice(0, limit),
  });
};

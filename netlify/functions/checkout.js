/**
 * checkout — start a Stripe Checkout session for a tool in the store.
 *
 * The secret key stays here on the server; the browser never sees it.
 *
 * Netlify environment variables:
 *   STRIPE_SECRET_KEY   required — your Stripe secret key (sk_live_… / sk_test_…)
 *   SITE_URL            optional — where to send people after paying.
 *                       Defaults to the site the request came from.
 *
 * POST { id: "<product id from products.json>" }
 *  → { ok: true, url: "https://checkout.stripe.com/..." }
 *
 * Prices come from products.json in the repo, so the amount charged can't be
 * tampered with from the browser.
 */

const fs = require('fs');
const path = require('path');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function readJson(name) {
  // These sit at the site root; try the usual spots.
  const tries = [
    path.join(__dirname, '../../' + name),
    path.join(process.cwd(), name),
  ];
  for (const p of tries) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  }
  return null;
}

/* Tools (products.json) and art packs (packs.json) sell through the same
   checkout, and both get their price from the repo — never from the browser. */
function loadCatalog() {
  const products = readJson('products.json');
  const packs = readJson('packs.json');
  if (!products && !packs) return null;
  return {
    currency: (products && products.currency) || (packs && packs.currency) || 'usd',
    products: [
      ...((products && products.products) || []),
      ...(((packs && packs.packs) || []).map(p => ({ ...p, billing: 'one-time' }))),
    ],
  };
}

exports.handler = async (event) => {
  const key = process.env.STRIPE_SECRET_KEY;

  // GET is a readiness probe, so the store page can say honestly whether the
  // Buy buttons work instead of guessing. Reveals a yes/no and nothing else.
  if (event.httpMethod === 'GET') return json(200, { ok: true, ready: !!key });

  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!key) {
    return json(400, { ok: false, error: 'Checkout isn’t connected yet — add STRIPE_SECRET_KEY in Netlify, or paste a Stripe Payment Link into products.json.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }

  const cat = loadCatalog();
  if (!cat) return json(500, { ok: false, error: 'Could not read the product catalog' });

  const p = (cat.products || []).find(x => x.id === body.id);
  if (!p) return json(404, { ok: false, error: 'No such product' });

  const origin = process.env.SITE_URL
    || (event.headers && (event.headers.origin || (event.headers.referer || '').replace(/\/[^/]*$/, '')))
    || '';

  const recurring = /month/i.test(p.billing || '');
  const form = new URLSearchParams();
  form.set('mode', recurring ? 'subscription' : 'payment');
  form.set('success_url', `${origin}/store.html?paid=${encodeURIComponent(p.id)}`);
  form.set('cancel_url', `${origin}/store.html`);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', cat.currency || 'usd');
  form.set('line_items[0][price_data][unit_amount]', String(Math.round(Number(p.price) * 100)));
  form.set('line_items[0][price_data][product_data][name]', p.name);
  if (p.tagline) form.set('line_items[0][price_data][product_data][description]', p.tagline);
  if (recurring) form.set('line_items[0][price_data][recurring][interval]', 'month');
  form.set('metadata[product_id]', p.id);
  // A discount code box on the payment page — Stripe hides it until one exists.
  form.set('allow_promotion_codes', 'true');

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      return json(502, { ok: false, error: (data.error && data.error.message) || 'Stripe rejected the request' });
    }
    return json(200, { ok: true, url: data.url, id: data.id });
  } catch (err) {
    return json(502, { ok: false, error: String(err.message || err) });
  }
};

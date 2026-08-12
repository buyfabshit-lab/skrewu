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

const CATALOG = require('./_catalog');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/**
 * Describe the key without ever showing it.
 *
 * "Invalid API Key provided" is Stripe refusing what it was handed, and from
 * outside there is no way to tell a truncated key from the wrong kind of key
 * from one with a stray newline on the end. Each has a different fix, so
 * guessing costs a round trip every time — with a customer waiting.
 *
 * Everything reported here is either a public constant or a property of the
 * shape. `sk_live_` is printed in Stripe's own documentation. The length is
 * the same for every key of a given type. What it never returns is a single
 * character of the key itself.
 *
 * `mangled` is the one that usually solves it: Stripe keys are letters,
 * digits and underscores only. Anything else in there — a bullet, a dot, an
 * asterisk, a space — means what got pasted was the *masked display* of the
 * key rather than the key, which is the easiest mistake to make in that
 * dashboard and looks completely normal in the Netlify box afterwards.
 */
function describeKey(key) {
  if (!key) return null;
  const m = /^((?:sk|pk|rk)_(?:live|test))_/.exec(key);
  return {
    kind: m ? m[1] : 'unrecognised',
    length: key.length,
    mangled: /[^A-Za-z0-9_]/.test(key),
    padded: key !== key.trim(),
  };
}

exports.handler = async (event) => {
  const key = process.env.STRIPE_SECRET_KEY;

  // GET is a readiness probe, so the store page can say honestly whether the
  // Buy buttons work instead of guessing.
  if (event.httpMethod === 'GET') {
    return json(200, { ok: true, ready: !!key, key: describeKey(key) });
  }

  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!key) {
    return json(400, { ok: false, error: 'Checkout isn’t connected yet — add STRIPE_SECRET_KEY in Netlify, or paste a Stripe Payment Link into products.json.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }

  const p = CATALOG.byId(body.id);
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
  form.set('line_items[0][price_data][currency]', CATALOG.CURRENCY);
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
      // The key's shape travels with the refusal, so the reason is on screen
      // at the moment it fails instead of one probe away.
      return json(502, {
        ok: false,
        error: (data.error && data.error.message) || 'Stripe rejected the request',
        key: describeKey(key),
      });
    }
    return json(200, { ok: true, url: data.url, id: data.id });
  } catch (err) {
    return json(502, { ok: false, error: String(err.message || err) });
  }
};

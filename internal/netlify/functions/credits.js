/**
 * credits — what a shop has, what a top-up costs, and buying one.
 *
 * The packs and their prices come from the database, not from this file. They
 * were already set up there, and a price that lives in two places eventually
 * disagrees with itself.
 *
 * Netlify environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY   to actually sell one
 *   SITE_URL            optional — where to return after paying
 *
 * GET  /api/credits?who=<slug>&k=<key>   → balance, what a run costs, the packs
 * POST /api/credits?who=<slug>&k=<key>  { pack:"pack_5k" }  → { url } to pay
 *
 * Buying is a Stripe Checkout session carrying the pack and the shop in its
 * metadata; the credits are added by the webhook when Stripe confirms the
 * money, never by the browser saying it paid.
 */

const C = require('./_credits');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const gone = C.missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (gone.length) {
    return json(500, { ok: false, error: 'Server not configured: missing ' + gone.join(' and ') + ' in Netlify.' });
  }

  const q = event.queryStringParameters || {};
  let me;
  try {
    me = await C.whoIsAsking(q.who || q.shop, q.k);
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
  if (me.error) return json(me.status, { ok: false, error: me.error });

  let wallet, list;
  try {
    wallet = await C.walletFor(me.tenant.slug);
    list = await C.packs();
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }

  if (event.httpMethod === 'GET') {
    let ledger = [];
    try {
      ledger = await C.sb(
        `ms_credit_ledger?user_id=eq.${encodeURIComponent(wallet.id)}` +
        `&select=amount,balance_after,type,description,created_at` +
        `&order=created_at.desc&limit=40`
      ) || [];
    } catch { /* the balance is the important part; the history can wait */ }

    return json(200, {
      ok: true,
      shop: me.tenant,
      balance: wallet.credits_balance,
      used: wallet.credits_used,
      prices: C.PRICES,
      packs: list || [],
      ledger,
      canBuy: !!process.env.STRIPE_SECRET_KEY,
    });
  }

  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(400, { ok: false, error: 'Card payments aren’t connected yet — set STRIPE_SECRET_KEY in Netlify.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }

  let pack;
  try { pack = await C.packById(body.pack); }
  catch (e) { return json(502, { ok: false, error: String(e.message || e) }); }
  if (!pack) return json(404, { ok: false, error: 'No such pack' });

  const origin = process.env.SITE_URL
    || (event.headers && (event.headers.origin || (event.headers.referer || '').replace(/\/[^/]*$/, '')))
    || '';
  const back = `${origin}/credits.html?who=${encodeURIComponent(me.tenant.slug)}&k=${encodeURIComponent(q.k)}`;

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', `${back}&bought=${encodeURIComponent(pack.id)}`);
  form.set('cancel_url', back);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'usd');
  // The price comes from the database row, never from the request.
  form.set('line_items[0][price_data][unit_amount]', String(pack.price));
  form.set('line_items[0][price_data][product_data][name]',
    Number(pack.credits).toLocaleString('en-US') + ' credits');
  form.set('line_items[0][price_data][product_data][description]', `Top-up for ${me.tenant.name}`);
  // What the webhook needs to know who to credit, and with how much.
  form.set('metadata[credit_pack]', pack.id);
  form.set('metadata[tenant_slug]', me.tenant.slug);
  form.set('allow_promotion_codes', 'true');

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await res.json();
    if (!res.ok) return json(502, { ok: false, error: (data.error && data.error.message) || 'Stripe refused it' });
    return json(200, { ok: true, url: data.url });
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
};

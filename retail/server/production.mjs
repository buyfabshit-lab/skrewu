import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ensure, HttpError, checkoutGaps } from './domain.mjs';

export function production(env, fetcher = fetch) {
  const key = () => env('SUPABASE_SERVICE_ROLE_KEY');
  async function call(path, options = {}) {
    ensure(env('SUPABASE_URL') && key(), 'The store is still being connected.', 503);
    const r = await fetcher(`${env('SUPABASE_URL')}${path}`, { ...options, signal: AbortSignal.timeout(15000), headers: {
      apikey: key(), Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', ...options.headers } });
    if (!r.ok) throw new HttpError(502, 'The store could not save or load this. Please try again.');
    const raw = await r.text(); return raw ? JSON.parse(raw) : null;
  }
  const db = (path, options) => call(`/rest/v1/${path}`, options);
  const owners = () => (env('RETAIL_OWNER_IDS') || '').split(',').map(x => x.trim());
  async function authUser(token) {
    ensure(token, 'Sign in to manage your shirts.', 401);
    const r = await fetcher(`${env('SUPABASE_URL')}/auth/v1/user`, { signal: AbortSignal.timeout(10000),
      headers: { apikey: key(), Authorization: `Bearer ${token}` } });
    ensure(r.ok, 'Your session expired. Sign in again.', 401);
    const user = await r.json();
    ensure(owners().includes(user.id), 'This account cannot manage the store.', 403);
    return user;
  }
  const driver = {
    preview: false,
    origin: () => env('RETAIL_ORIGIN'),
    origins: () => [env('RETAIL_ORIGIN'), env('RETAIL_OWNER_ORIGIN')].filter(Boolean),
    designerOrigins: () => (env('RETAIL_DESIGNER_ORIGINS') || '').split(',').map(x => x.trim()).filter(value => {
      try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value; } catch { return false; }
    }),
    gaps: () => checkoutGaps(env),
    policies: () => ({ shipping: env('RETAIL_SHIPPING_NOTE') || '', returns: env('RETAIL_RETURNS_NOTE') || '' }),
    async login(email, password) {
      ensure(env('SUPABASE_URL') && key() && env('RETAIL_OWNER_IDS'), 'Owner sign-in is still being connected.', 503);
      const r = await fetcher(`${env('SUPABASE_URL')}/auth/v1/token?grant_type=password`, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { apikey: key(), 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      ensure(r.ok, 'Sign-in failed. Check your email and password.', 401);
      const data = await r.json(); await authUser(data.access_token);
      return { token: data.access_token, expires: Math.min(data.expires_in || 3600, 3600) };
    },
    authenticate: authUser,
    async logout(token) {
      if (token) await fetcher(`${env('SUPABASE_URL')}/auth/v1/logout`, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { apikey: key(), Authorization: `Bearer ${token}` } });
    },
    async products(owner = false) { return db(`retail_products?select=*&order=updated_at.desc${owner ? '' : '&status=eq.published'}`); },
    async product(id) { return (await db(`retail_products?id=eq.${id}&select=*`))[0]; },
    async save(p) {
      return (await db('retail_products?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(p) }))[0];
    },
    async imageExists(path) { return (await db(`retail_images?path=eq.${encodeURIComponent(path)}&select=path`)).length > 0; },
    async upload(bytes, type) {
      const path = `${randomUUID()}.${type.ext}`;
      await call(`/storage/v1/object/retail-images/${path}`, { method: 'POST', headers: { 'Content-Type': type.mime }, body: bytes });
      await db('retail_images', { method: 'POST', body: JSON.stringify({ path }) });
      return path;
    },
    async imageUrl(path) {
      if (!path) return null;
      const data = await call(`/storage/v1/object/sign/retail-images/${path}`, { method: 'POST', body: JSON.stringify({ expiresIn: 600 }) });
      return `${env('SUPABASE_URL')}/storage/v1${data.signedURL}`;
    },
    async checkout(snapshot, requestId) {
      // An immutable pending record precedes Stripe. Repeated request IDs use the same snapshot.
      await db('retail_orders?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({ id: requestId, snapshot, status: 'pending' }) });
      const order = (await db(`retail_orders?id=eq.${requestId}&select=*`))[0];
      ensure(order && JSON.stringify(order.snapshot) !== '', 'Checkout could not be prepared.', 502);
      for (const k of Object.keys(snapshot)) ensure(isDeepStrictEqual(order.snapshot[k], snapshot[k]), 'Your selection changed. Start a new checkout.', 409);
      ensure(order.status === 'pending', 'This checkout was already paid. Start a new purchase.', 409);
      // Stripe idempotency retention is at least 24 hours; never reuse an old key.
      ensure(Date.now() - Date.parse(order.created_at) < 23 * 3600000, 'This checkout expired. Refresh and try again.', 409);
      const successOrigin = (env('RETAIL_SUCCESS_URL') || env('RETAIL_ORIGIN')).replace(/\/$/, '');
      const p = new URLSearchParams({ mode: 'payment', 'payment_method_types[0]': 'card',
        success_url: `${successOrigin}/?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${env('RETAIL_ORIGIN')}/?shirt=${snapshot.product_id}&checkout=cancelled`,
        client_reference_id: requestId, 'metadata[retail_order_id]': requestId, 'metadata[source]': 'skrewu-retail',
        'line_items[0][quantity]': String(snapshot.quantity),
        'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': String(snapshot.price_cents),
        'line_items[0][price_data][product_data][name]': snapshot.name,
        'line_items[0][price_data][product_data][description]': `${snapshot.size} / ${snapshot.color}`,
        'shipping_options[0][shipping_rate]': env('RETAIL_SHIPPING_RATE'), 'automatic_tax[enabled]': env('RETAIL_AUTOMATIC_TAX') });
      env('RETAIL_COUNTRIES').split(',').forEach((country, i) => p.set(`shipping_address_collection[allowed_countries][${i}]`, country));
      const r = await fetcher('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': `retail-${requestId}`, 'Stripe-Version': '2026-08-26.dahlia' }, body: p });
      ensure(r.ok, 'Checkout could not open. Please try again.', 502);
      const session = await r.json();
      ensure(session.url?.startsWith('https://checkout.stripe.com/'), 'Checkout could not open.', 502);
      return { url: session.url };
    },
    webhookSecret: () => env('STRIPE_WEBHOOK_SECRET'),
    liveMode: () => !!env('STRIPE_SECRET_KEY')?.includes('_live_'),
    async recordPaid(session) {
      // The RPC verifies the original snapshot, and writes the paid record and OmniFlow row in one transaction.
      return db('rpc/retail_record_payment', { method: 'POST', body: JSON.stringify({ session }) });
    }
  };
  return driver;
}

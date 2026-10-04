import { ensure, HttpError, productInput, selection, imageType, uuid, verifySignature } from './domain.mjs';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
async function body(req, max = 30000) {
  ensure(req.headers.get('Content-Type')?.split(';')[0] === 'application/json', 'Send a valid request.', 415);
  const raw = await req.text(); ensure(raw.length <= max, 'That request is too large.', 413);
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid request.'); }
}
const cookieToken = req => (req.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('retail_session='))?.slice(15) || '';
export function createApp(driver) {
  return async req => {
    try {
      const path = new URL(req.url).pathname;
      const token = cookieToken(req);
      const post = req.method === 'POST';
      if (post && path !== '/api/retail/webhook') {
        const origins = driver.origins ? driver.origins() : [driver.origin()];
        ensure(origins.includes(req.headers.get('origin')), 'Request origin rejected.', 403);
      }
      if (path === '/api/retail/catalog' && req.method === 'GET') {
        const rows = await driver.products();
        const products = await Promise.all(rows.map(async ({ image_path, artwork_path, design_spec, artwork_url, additional_artwork_urls, ...p }) => ({ ...p, image_url: await driver.imageUrl(image_path) })));
        return json({ products, preview: driver.preview, checkoutReady: !driver.gaps().length, policies: driver.policies() });
      }
      if (path === '/api/retail/login' && post) {
        const data = await body(req);
        ensure(typeof data.email === 'string' && data.email.length <= 254 && typeof data.password === 'string' && data.password.length <= 1024, 'Enter your email and password.');
        const session = await driver.login(data.email, data.password);
        return json({ ok: true }, 200, { 'Set-Cookie': `retail_session=${session.token}; Path=/api/retail; HttpOnly; SameSite=Strict; Max-Age=${session.expires}${driver.preview ? '' : '; Secure'}` });
      }
      if (path === '/api/retail/logout' && post) {
        await driver.logout(token);
        return json({ ok: true }, 200, { 'Set-Cookie': `retail_session=; Path=/api/retail; HttpOnly; SameSite=Strict; Max-Age=0${driver.preview ? '' : '; Secure'}` });
      }
      if (path === '/api/retail/owner' && req.method === 'GET') {
        await driver.authenticate(token);
        const products = await Promise.all((await driver.products(true)).map(async p => ({ ...p, image_url: await driver.imageUrl(p.image_path),
          artwork_url: p.artwork_path ? await driver.imageUrl(p.artwork_path) : null,
          additional_artwork_urls: await Promise.all((p.design_spec?.additional_prints || []).map(async item => ({ ...item, url: await driver.imageUrl(item.artwork_path) }))) })));
        return json({ products, preview: driver.preview, checkoutReady: !driver.gaps().length, setup: driver.gaps(),
          designerOrigins: driver.designerOrigins?.() || [] });
      }
      if (path === '/api/retail/product' && post) {
        await driver.authenticate(token);
        const input = await body(req);
        // Older editor tabs do not know these fields. Keep existing production
        // artwork unless a current client explicitly changes it.
        if (input && typeof input === 'object' && uuid(input.id) &&
          (!Object.hasOwn(input, 'artwork_path') || !Object.hasOwn(input, 'design_spec'))) {
          const existing = await driver.product(input.id);
          if (!Object.hasOwn(input, 'artwork_path')) input.artwork_path = existing?.artwork_path || '';
          if (!Object.hasOwn(input, 'design_spec')) input.design_spec = existing?.design_spec || null;
        }
        const p = productInput(input);
        if (p.image_path) ensure(await driver.imageExists(p.image_path), 'Upload this photo before saving.');
        if (p.artwork_path) ensure(await driver.imageExists(p.artwork_path), 'Upload the original print file before saving.');
        for (const item of p.design_spec?.additional_prints || []) ensure(await driver.imageExists(item.artwork_path), 'Upload every original print file before saving.');
        return json({ product: await driver.save(p) });
      }
      if (path === '/api/retail/upload' && post) {
        await driver.authenticate(token);
        const bytes = Buffer.from(await req.arrayBuffer());
        ensure(bytes.length > 0 && bytes.length <= 4 * 1024 * 1024, 'Choose an image smaller than 4 MB.', 413);
        const type = imageType(bytes);
        const path = await driver.upload(bytes, type);
        return json({ image_path: path, image_url: await driver.imageUrl(path) });
      }
      if (path === '/api/retail/checkout' && post) {
        ensure(!driver.gaps().length, driver.preview ? 'Review only — no payment is taken here.' : 'Checkout is not open yet. Please check back soon.', 503);
        const data = await body(req);
        ensure(uuid(data.product_id) && uuid(data.request_id), 'Invalid checkout.');
        const snapshot = selection(await driver.product(data.product_id), data);
        return json(await driver.checkout(snapshot, data.request_id));
      }
      if (path === '/api/retail/webhook' && post) {
        const raw = await req.text();
        ensure(raw.length < 1000000, 'Payload too large.', 413);
        ensure(driver.webhookSecret(), 'Webhook is not configured.', 503);
        ensure(verifySignature(raw, req.headers.get('stripe-signature'), driver.webhookSecret()), 'Invalid signature.', 401);
        let event; try { event = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid webhook.'); }
        if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return json({ ignored: true });
        const session = event.data?.object;
        if (session?.metadata?.source !== 'skrewu-retail') return json({ ignored: true });
        ensure(session.livemode === driver.liveMode(), 'Payment mode does not match this store.', 400);
        if (session.payment_status !== 'paid') return json({ ignored: true });
        ensure(uuid(session.metadata.retail_order_id), 'Missing retail order.', 400);
        await driver.recordPaid(session);
        return json({ received: true });
      }
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      return json({ error: error instanceof HttpError ? error.message : 'Something went wrong. Please try again.' }, error.status || 500);
    }
  };
}

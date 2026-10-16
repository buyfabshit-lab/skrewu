import { createHmac, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function ensure(ok, message, status = 400) { if (!ok) throw new HttpError(status, message); }
export function text(value, max, label, required = true) {
  ensure(typeof value === 'string', `Enter ${label}.`);
  const clean = value.trim();
  ensure((!required || clean.length > 0) && clean.length <= max, `Check ${label} (up to ${max} characters).`);
  return clean;
}
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function designSpec(value) {
  if (value == null) return null;
  ensure(typeof value === 'object' && !Array.isArray(value), 'Check the print details.');
  ensure(uuid(value.transfer_id), 'Invalid design transfer.');
  ensure(['front', 'back', 'left sleeve', 'right sleeve'].includes(value.placement), 'Choose a print placement.');
  for (const key of ['width_inches', 'height_inches']) {
    ensure(typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] > 0 && value[key] <= 60,
      'Print dimensions must be greater than zero and no larger than 60 inches.');
  }
  ensure(value.additional_prints == null || (Array.isArray(value.additional_prints) && value.additional_prints.length <= 3), 'Use no more than four print placements.');
  const placements = new Set([value.placement]);
  const additional = (value.additional_prints || []).map(item => {
    ensure(item && ['front', 'back', 'left sleeve', 'right sleeve'].includes(item.placement) && !placements.has(item.placement), 'Use one print file per placement.');
    placements.add(item.placement);
    for (const key of ['width_inches', 'height_inches']) ensure(typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] > 0 && item[key] <= 60, 'Check the additional print dimensions.');
    ensure(typeof item.artwork_path === 'string' && /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(item.artwork_path), 'Upload every original print file first.');
    return { placement: item.placement, width_inches: item.width_inches, height_inches: item.height_inches, artwork_path: item.artwork_path };
  });
  return { transfer_id: value.transfer_id, source_design_id: text(value.source_design_id || '', 100, 'a design reference', false),
    placement: value.placement, width_inches: value.width_inches, height_inches: value.height_inches,
    ...(additional.length ? { additional_prints: additional } : {}) };
}
export function productInput(body) {
  ensure(uuid(body.id), 'Invalid product.');
  ensure(['draft', 'published', 'archived'].includes(body.status), 'Choose a product status.');
  ensure(Number.isInteger(body.price_cents) && body.price_cents >= 100 && body.price_cents <= 100000, 'Price must be $1–$1,000.');
  ensure(Array.isArray(body.variants) && body.variants.length > 0 && body.variants.length <= 100, 'Add between 1 and 100 size/color combinations.');
  const seen = new Set();
  const variants = body.variants.map(v => {
    const size = text(v.size, 20, 'a size');
    const color = text(v.color, 40, 'a color');
    const key = `${size.toLowerCase()}|${color.toLowerCase()}`;
    ensure(!seen.has(key), 'Remove duplicate size/color combinations.'); seen.add(key);
    ensure(typeof v.available === 'boolean', 'Choose availability for every option.');
    return { size, color, available: v.available };
  });
  const image_path = text(body.image_path || '', 150, 'a photo', false);
  ensure(!image_path || /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(image_path), 'Upload a product photo first.');
  ensure(body.status !== 'published' || image_path, 'Add a photo before publishing.');
  const artwork_path = text(body.artwork_path || '', 150, 'a print file', false);
  ensure(!artwork_path || /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(artwork_path), 'Upload the original print file first.');
  const design_spec = designSpec(body.design_spec);
  ensure(!design_spec || artwork_path, 'Add the original print file for this design.');
  return { id: body.id, name: text(body.name, 100, 'a product name'), description: text(body.description, 3000, 'a description'),
    garment: text(body.garment, 1000, 'shirt information'), price_cents: body.price_cents,
    status: body.status, image_path, artwork_path, design_spec, variants, updated_at: new Date().toISOString() };
}
export function selection(product, body) {
  ensure(product && product.status === 'published', 'This shirt is no longer available.', 409);
  ensure(Number.isInteger(body.quantity) && body.quantity >= 1 && body.quantity <= 20, 'Choose a quantity from 1 to 20.');
  const variant = product.variants.find(v => v.size === body.size && v.color === body.color);
  ensure(variant?.available, 'That size and color is unavailable.', 409);
  // Compare the displayed price so a price edit cannot silently raise the charge.
  ensure(body.expected_price_cents === product.price_cents, 'The price changed. Refresh this shirt before checking out.', 409);
  const snapshot = { product_id: product.id, name: product.name, garment: product.garment, size: variant.size,
    color: variant.color, quantity: body.quantity, price_cents: product.price_cents, subtotal_cents: product.price_cents * body.quantity };
  if (product.artwork_path) snapshot.artwork_path = product.artwork_path;
  if (product.design_spec) snapshot.design_spec = designSpec(product.design_spec);
  return snapshot;
}
export function imageType(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { ext: 'png', mime: 'image/png' };
  if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { ext: 'jpg', mime: 'image/jpeg' };
  if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  throw new HttpError(400, 'Choose a PNG, JPG, or WebP image.');
}
export function verifySignature(raw, header, secret, now = Date.now()) {
  const fields = String(header || '').split(',').map(s => s.trim().split('='));
  const t = fields.find(([k]) => k === 't')?.[1];
  if (!/^\d+$/.test(t || '') || Math.abs(now / 1000 - Number(t)) > 300 || !secret) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  return fields.filter(([k]) => k === 'v1').some(([,sig]) => {
    if (!/^[0-9a-f]{64}$/i.test(sig || '')) return false;
    return timingSafeEqual(expected, Buffer.from(sig, 'hex'));
  });
}
export function checkoutGaps(env) {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'RETAIL_ORIGIN', 'RETAIL_SHIPPING_RATE', 'RETAIL_COUNTRIES', 'RETAIL_SHIPPING_NOTE', 'RETAIL_RETURNS_NOTE'];
  const gaps = required.filter(k => !env(k));
  if (!['true','false'].includes(env('RETAIL_AUTOMATIC_TAX'))) gaps.push('RETAIL_AUTOMATIC_TAX');
  if (env('RETAIL_CHECKOUT_ENABLED') !== 'true') gaps.push('RETAIL_CHECKOUT_ENABLED');
  if (!/^(sk|rk)_(test|live)_/.test(env('STRIPE_SECRET_KEY') || '')) gaps.push('Valid Stripe key');
  if (!/^https:\/\//.test(env('RETAIL_ORIGIN') || '')) gaps.push('HTTPS retail origin');
  if (env('RETAIL_SUCCESS_URL') && !/^https:\/\//.test(env('RETAIL_SUCCESS_URL'))) gaps.push('HTTPS retail success URL');
  if (!/^shr_/.test(env('RETAIL_SHIPPING_RATE') || '')) gaps.push('Stripe shipping rate');
  if (!/^[A-Z]{2}(,[A-Z]{2})*$/.test(env('RETAIL_COUNTRIES') || '')) gaps.push('Shipping countries');
  if (env('STRIPE_SECRET_KEY')?.includes('_live_') && env('RETAIL_ALLOW_LIVE') !== 'true') gaps.push('RETAIL_ALLOW_LIVE');
  return [...new Set(gaps)];
}

export const $ = id => document.getElementById(id);
export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export async function api(path, options = {}) {
  const r = await fetch(`/api/retail/${path}`, { credentials: 'same-origin', ...options });
  let data; try { data = await r.json(); } catch { throw new Error('The store could not connect. Please try again.'); }
  if (!r.ok) { const e = new Error(data.error || 'Please try again.'); e.status = r.status; throw e; }
  return data;
}
export const send = (path, data) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export function node(tag, attrs = {}, content = '') {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
  el.textContent = content; return el;
}
export function artwork(product, preview = false) {
  if (product.image_url) return node('img', { src: product.image_url, alt: product.name, loading: 'lazy' });
  if (preview && product.sample) {
    const shirt = node('div', { class: `sample-shirt ${product.sample}` });
    shirt.append(node('span', {}, 'SKREW\nU'), node('small', {}, 'SAMPLE / NOT FOR SALE'));
    return shirt;
  }
  return node('span', { class: 'small' }, 'Photo unavailable');
}

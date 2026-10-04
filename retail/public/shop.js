import { $, money, api, send, node, artwork } from './shared.js';
let products = [], preview = false, ready = false, current, requestId;
function notice(message) { $('notice').textContent = message; $('notice').hidden = false; }
function render() {
  $('grid').replaceChildren(); $('count').textContent = `${products.length} shirt${products.length === 1 ? '' : 's'}`;
  if (!products.length) {
    const empty = node('div', { class: 'empty' }); empty.append(node('h2', {}, 'The next drop is on its way.'), node('p', {}, 'Check back for shirts from SKREW U.'));
    $('grid').append(empty); return;
  }
  for (const p of products) {
    const button = node('button', { class: 'card', 'aria-label': `View ${p.name}, ${money(p.price_cents)}` });
    const art = node('div', { class: 'art' }); art.append(artwork(p, preview));
    if (p.sample && preview) art.append(node('span', { class: 'badge' }, 'Example shirt'));
    else if (!p.variants.some(v => v.available)) art.append(node('span', { class: 'badge' }, 'Sold out'));
    const content = node('div', { class: 'card-body' }); content.append(node('h3', {}, p.name), node('span', { class: 'small' }, [...new Set(p.variants.map(v => v.color))].join(' / ')));
    const bottom = node('div', { class: 'card-bottom' }); bottom.append(node('span', { class: 'price' }, money(p.price_cents)), node('span', { class: 'card-arrow', 'aria-hidden': 'true' }, '↗'));
    content.append(bottom); button.append(art, content); button.addEventListener('click', () => openProduct(p)); $('grid').append(button);
  }
}
function openProduct(p) {
  current = p; requestId = crypto.randomUUID();
  $('productName').textContent = p.name; $('productPrice').textContent = money(p.price_cents);
  $('productDescription').textContent = p.description; $('productGarment').textContent = p.garment;
  $('productArt').replaceChildren(artwork(p, preview)); $('quantity').value = '1'; $('buyMessage').textContent = '';
  $('color').replaceChildren(...[...new Set(p.variants.map(v => v.color))].map(c => node('option', { value: c }, c)));
  sizes();
  $('checkoutNote').textContent = preview ? 'Review only. No payment is taken here.' : ready ? 'Shipping and any applicable tax are shown at checkout.' : 'Checkout is not open yet. Please check back soon.';
  history.replaceState(null, '', `?shirt=${p.id}`); $('detail').showModal();
}
function sizes() {
  const old = $('size').value;
  $('size').replaceChildren(...current.variants.filter(v => v.color === $('color').value).map(v => {
    const o = node('option', { value: v.size }, v.size + (v.available ? '' : ' — unavailable')); o.disabled = !v.available; return o;
  }));
  if ([...$('size').options].some(o => o.value === old && !o.disabled)) $('size').value = old;
  else $('size').value = [...$('size').options].find(o => !o.disabled)?.value || '';
  total();
}
function total() {
  const q = Number($('quantity').value), available = current.variants.some(v => v.size === $('size').value && v.color === $('color').value && v.available);
  $('subtotal').textContent = money(current.price_cents * (Number.isInteger(q) && q > 0 ? q : 0));
  $('buy').disabled = !available || !ready; $('buy').textContent = !available ? 'Unavailable' : preview ? 'Checkout disabled in review' : ready ? 'Continue to checkout ↗' : 'Checkout opens soon';
}
$('color').addEventListener('change', () => { requestId = crypto.randomUUID(); sizes(); });
for (const id of ['size', 'quantity']) $(id).addEventListener('input', () => { requestId = crypto.randomUUID(); total(); });
$('close').addEventListener('click', () => $('detail').close());
$('detail').addEventListener('close', () => history.replaceState(null, '', location.pathname));
$('buyForm').addEventListener('submit', async e => {
  e.preventDefault(); $('buy').disabled = true; $('buyMessage').textContent = 'Opening secure checkout…';
  try {
    const data = await send('checkout', { product_id: current.id, size: $('size').value, color: $('color').value,
      quantity: Number($('quantity').value), expected_price_cents: current.price_cents, request_id: requestId });
    if (!data.url?.startsWith('https://checkout.stripe.com/')) throw new Error('Checkout could not open.');
    location.assign(data.url);
  } catch (e) { $('buyMessage').textContent = e.message; total(); }
});
async function load() {
  try {
    const data = await api('catalog'); products = data.products; preview = data.preview; ready = data.checkoutReady;
    $('preview').hidden = !preview; render();
    $('shipping').textContent = data.policies.shipping; $('returns').textContent = data.policies.returns;
    $('policies').hidden = !data.policies.shipping && !data.policies.returns;
    const query = new URLSearchParams(location.search);
    if (query.get('checkout') === 'returned') notice('Thanks for visiting checkout. Your payment receipt comes from Stripe once payment is confirmed.');
    if (query.get('checkout') === 'cancelled') notice('Checkout was cancelled. You can choose your shirt again below.');
    const shirt = products.find(p => p.id === query.get('shirt'));
    if (shirt) openProduct(shirt);
    else if (query.has('shirt')) notice('This shirt is no longer on the rack. Browse the current shirts below.');
  } catch (e) { $('count').textContent = 'Could not load shirts'; notice(e.message); const retry = node('button', {}, 'Try again'); retry.onclick = () => { $('notice').hidden = true; load(); }; $('grid').replaceChildren(retry); }
}
load();

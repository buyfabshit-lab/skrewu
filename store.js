/* ============ SKREW U · SHOP TOOLS STORE ============ */
/* Reads products.json and sends buyers to Stripe.                            */
/* Two ways to take money, whichever you've set up:                           */
/*   1. paste a Stripe Payment Link into products.json  → zero backend        */
/*   2. leave it null and set STRIPE_SECRET_KEY in Netlify → checkout function*/

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let toastTimer;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}

const money = (n) => '$' + Number(n).toLocaleString('en-US');

async function load() {
  let cat;
  try {
    const res = await fetch('products.json', { cache: 'no-store' });
    cat = await res.json();
  } catch {
    $('grid').innerHTML = '<p style="color:var(--bone-dim)">Could not load the catalog.</p>';
    return;
  }

  const items = cat.products || [];
  $('grid').innerHTML = items.map(p => `
    <article class="card${p.badge ? ' hot' : ''}">
      ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
      <div class="body">
        <h3>${esc(p.name)}</h3>
        <div class="tag">${esc(p.tagline || '')}</div>
        <p>${esc(p.blurb || '')}</p>
        <ul>${(p.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        <div class="foot">
          <div class="price">${money(p.price)}<small>${esc(p.billing || '')}</small></div>
          <div class="acts">
            ${p.demo ? `<a class="try" href="${esc(p.demo)}">Try it</a>` : ''}
            <button class="buy" data-id="${esc(p.id)}" type="button">Buy</button>
          </div>
        </div>
      </div>
    </article>`).join('');

  $('grid').querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', () => buy(items.find(x => x.id === btn.dataset.id), btn));
  });

  // Say plainly whether checkout is actually wired up yet.
  const ready = items.filter(p => p.paymentLink).length;
  $('payNote').textContent = ready
    ? `${ready} of ${items.length} products have a payment link set.`
    : 'Checkout isn’t connected yet — add a Stripe Payment Link per product in products.json, or set STRIPE_SECRET_KEY in Netlify.';
}

async function buy(p, btn) {
  if (!p) return;

  // 1. a Payment Link you pasted in — straight there
  if (p.paymentLink) { location.href = p.paymentLink; return; }

  // 2. otherwise ask the checkout function to make a Stripe session
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'One sec…';
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id }),
    });
    const data = await res.json();
    if (data.ok && data.url) { location.href = data.url; return; }
    toast(data.error || 'Checkout isn’t connected yet.', true);
  } catch (e) {
    toast('Could not reach checkout: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

load();

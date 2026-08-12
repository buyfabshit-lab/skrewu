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

/* Art packs — the artwork itself, from packs.json. Same checkout as the tools. */
async function loadPacks() {
  let cat;
  try {
    const res = await fetch('packs.json', { cache: 'no-store' });
    cat = await res.json();
  } catch { cat = null; }

  const packs = (cat && cat.packs) || [];
  if (!packs.length) {
    $('packGrid').innerHTML = '';
    $('packNote').textContent = 'No packs up yet — add them to packs.json and they appear here and in the sticker builder.';
    return;
  }

  $('packGrid').innerHTML = packs.map(p => `
    <article class="card">
      <div class="body">
        ${p.cover ? `<img src="${esc(p.cover)}" alt="" style="width:100%;aspect-ratio:16/10;object-fit:cover;border:1px solid var(--iron);">` : ''}
        <h3>${esc(p.name)}</h3>
        <div class="tag">${esc(p.tagline || '')}</div>
        <p>${esc(p.blurb || '')}</p>
        <ul>
          ${p.count ? `<li>${esc(p.count)} pieces, transparent PNG</li>` : ''}
          ${p.license ? `<li>${esc(p.license)}</li>` : ''}
          <li>Works in the sticker sheet builder</li>
        </ul>
        <div class="foot">
          <div class="price">${money(p.price)}<small>one-time</small></div>
          <div class="acts">
            <a class="try" href="sticker.html">Build a sheet</a>
            <button class="buy" data-pack="${esc(p.id)}" type="button">Buy</button>
          </div>
        </div>
      </div>
    </article>`).join('');

  $('packGrid').querySelectorAll('[data-pack]').forEach(btn => {
    btn.addEventListener('click', () => buy(packs.find(x => x.id === btn.dataset.pack), btn));
  });

  const ready = packs.filter(p => p.paymentLink).length;
  $('packNote').textContent = ready
    ? `${ready} of ${packs.length} packs have a payment link set.`
    : 'Checkout isn’t connected yet — add a Stripe Payment Link per pack in packs.json, or set STRIPE_SECRET_KEY in Netlify.';
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

/* ── Coming back from Stripe ──────────────────────────────────────────────
   The worst moment to go quiet is right after somebody hands you $899. Say
   plainly that it worked and what happens next, and take the flag out of the
   URL so a refresh or a shared link doesn't claim a payment that didn't
   happen. */
async function landed() {
  const paidId = new URLSearchParams(location.search).get('paid');
  if (!paidId) return;
  history.replaceState(null, '', location.pathname);

  let name = null;
  try {
    const res = await fetch('products.json', { cache: 'no-store' });
    const cat = await res.json();
    const p = (cat.products || []).find(x => x.id === paidId);
    name = p && p.name;
  } catch { /* the thanks works without the name */ }

  const el = document.createElement('div');
  el.className = 'paid-note';
  el.innerHTML = `
    <div class="pn-in">
      <div class="pn-mark">✓</div>
      <div>
        <h3>You're in${name ? ` — ${esc(name)} is yours` : ''}.</h3>
        <p>Payment received. Your receipt is in your email from Stripe, and your
           setup link follows from us within the day — usually a lot sooner.
           Nothing else to do.</p>
      </div>
      <button type="button" aria-label="Close">×</button>
    </div>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  document.querySelector('main').prepend(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* Ask the server whether the Buy buttons actually work, instead of guessing
   from payment links alone and telling a connected store it isn't. */
async function checkReady() {
  try {
    const res = await fetch('/api/checkout');
    const d = await res.json();
    if (d && d.ready) {
      $('payNote').textContent = 'Card checkout by Stripe. One-time tools are yours for good; monthly ones stop when you say.';
      $('packNote').textContent = 'Same checkout as the tools — buy a pack and it lands in the sticker builder.';
    }
  } catch { /* leave the honest not-connected message */ }
}

/* The catalog writes the not-connected notes, so the probe has to run after
   it — the other order is a race the wrong message sometimes wins. */
(async () => {
  await Promise.all([load(), loadPacks()]);
  landed();
  checkReady();
})();

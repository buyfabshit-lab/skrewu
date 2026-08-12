/* ============================================================
   Logo Vault — sell licensed brand art with tiered licensing
   Portable tool module (MidnightFusion).

   - Catalog + license tiers are config-driven (config.json / ?config=).
   - Checkout: Shopify Storefront API (cartCreate → checkoutUrl).
   - Secure downloads: Supabase signed URLs on the print-assets bucket,
     ideally minted by a signer endpoint that first verifies the Shopify order.
   - Watermark stays on previews; the clean file only ever arrives as a
     short-lived signed URL after purchase — clean art never enters the DOM.

   See README.md for the config schema, API surface, and security model.
   ============================================================ */

/* ── Default config (overridden by config.json / ?config=) ── */
const DEFAULT_CONFIG = {
  branding: {
    businessName: 'MidnightFusion',
    productName: 'Logo Vault',
    tagline: 'Licensed brand art',
    eyebrow: 'MidnightFusion · Licensed Assets',
    logoUrl: null,
    colors: { accent: '#7c6cff', accent2: '#5b4be0', gold: '#e6b64c' },
  },
  backend: {
    supabaseUrl: 'https://qmztuagvxopahowexrum.supabase.co',
    supabaseAnonKey: 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh',
    assetBucket: 'print-assets',
    // Preferred secure path: an endpoint (e.g. Supabase Edge Function) that
    // verifies the Shopify order server-side, then returns a signed URL.
    // If null, the tool falls back to signing directly from the browser
    // (demo only — do NOT ship that to production; see README).
    signerEndpoint: null,
    signedUrlTtlSeconds: 300,
  },
  shopify: {
    // Storefront API. storefrontDomain like "your-shop.myshopify.com".
    storefrontDomain: null,
    storefrontAccessToken: null,
    apiVersion: '2024-10',
  },
  tiers: [],     // [{id,name,blurb}]
  catalog: [],   // see README for shape
};

let CONFIG = DEFAULT_CONFIG;
let sb = null;

/* ── Config load / merge ── */
async function loadConfig() {
  const params = new URLSearchParams(location.search);
  const url = params.get('config') || 'config.json';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('config ' + res.status);
    const raw = await res.json();
    return {
      branding: { ...DEFAULT_CONFIG.branding, ...(raw.branding || {}),
        colors: { ...DEFAULT_CONFIG.branding.colors, ...((raw.branding || {}).colors || {}) } },
      backend: { ...DEFAULT_CONFIG.backend, ...(raw.backend || {}) },
      shopify: { ...DEFAULT_CONFIG.shopify, ...(raw.shopify || {}) },
      tiers: Array.isArray(raw.tiers) ? raw.tiers : DEFAULT_CONFIG.tiers,
      catalog: Array.isArray(raw.catalog) ? raw.catalog : DEFAULT_CONFIG.catalog,
    };
  } catch (e) {
    console.info('[LogoVault] using built-in default config (' + e.message + ')');
    return DEFAULT_CONFIG;
  }
}

function applyBranding(cfg) {
  const b = cfg.branding;
  document.title = b.productName + ' — ' + b.businessName;
  setText('brandName', b.productName);
  setText('brandTagline', b.tagline);
  setText('footBrand', b.productName);
  if (b.eyebrow) setText('heroEyebrow', b.eyebrow);
  if (b.logoUrl) {
    const el = document.getElementById('brandLogo');
    if (el) el.innerHTML = `<img src="${b.logoUrl}" alt="${esc(b.businessName)}" style="width:100%;height:100%;object-fit:cover;">`;
  }
  const c = b.colors || {}, root = document.documentElement.style;
  if (c.accent)  { root.setProperty('--accent', c.accent); }
  if (c.accent2) { root.setProperty('--accent-2', c.accent2); }
  if (c.gold)    { root.setProperty('--gold', c.gold); }
}

/* ── Helpers ── */
const $ = id => document.getElementById(id);
function setText(id, t) { const el = $(id); if (el) el.textContent = t; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const money = (n, cur) => n == null ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:cur||'USD'}).format(n);
function tierById(id){ return CONFIG.tiers.find(t => t.id === id); }
function productById(id){ return CONFIG.catalog.find(p => p.id === id); }
function priceFor(product, tierId){
  if (product.prices && product.prices[tierId] != null) return product.prices[tierId];
  const t = tierById(tierId);
  return t && t.price != null ? t.price : null;
}

/* ── Render: tier legend ── */
function renderTiers() {
  const wrap = $('tiersLegend');
  wrap.innerHTML = CONFIG.tiers.map(t =>
    `<div class="tier ${t.id}">
       <div class="tname"><span class="dot"></span>${esc(t.name)}</div>
       <div class="tblurb">${esc(t.blurb || '')}</div>
       ${t.price != null ? `<div class="tprice">from <b>${money(t.price, t.currency)}</b></div>` : ''}
     </div>`).join('');
}

/* ── Render: catalog grid ── */
function renderCatalog() {
  const grid = $('catalogGrid');
  const tpl = $('cardTpl');
  $('catalogCount').textContent = `${CONFIG.catalog.length} piece${CONFIG.catalog.length === 1 ? '' : 's'}`;
  grid.innerHTML = '';
  if (!CONFIG.catalog.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:var(--dim);padding:40px;text-align:center;">No pieces configured. Add a <code>catalog</code> to config.json.</div>`;
    return;
  }
  const wmText = (CONFIG.branding.businessName + '  ').repeat(80);
  CONFIG.catalog.forEach(p => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const preview = node.querySelector('.preview');
    const ph = node.querySelector('[data-ph]');
    if (p.previewUrl) {
      const img = document.createElement('img');
      img.alt = p.name; img.loading = 'lazy'; img.src = p.previewUrl;
      img.onerror = () => { img.remove(); ph.textContent = p.name; };
      preview.insertBefore(img, preview.firstChild);
      ph.textContent = '';
    } else {
      ph.textContent = p.name;
    }
    node.querySelector('[data-wm]').setAttribute('data-wm', wmText);
    node.querySelector('[data-name]').textContent = p.name;
    node.querySelector('[data-meta]').textContent = p.meta || (p.formats ? p.formats.join(' · ') : 'Vector + raster · print-ready');
    const btns = node.querySelector('[data-tierbtns]');
    btns.innerHTML = CONFIG.tiers.map(t =>
      `<button class="tierbtn ${t.id}" data-tier="${t.id}">
         <div class="tl">${esc(t.name)}</div>
         <div class="tp">${money(priceFor(p, t.id), t.currency)}</div>
       </button>`).join('');
    btns.querySelectorAll('.tierbtn').forEach(b =>
      b.addEventListener('click', () => openLicense(p.id, b.dataset.tier)));
    node.querySelector('.preview').addEventListener('click', () => openLicense(p.id, defaultTierId()));
    grid.appendChild(node);
  });
}
function defaultTierId(){ return (CONFIG.tiers[0] || {}).id; }

/* ── License modal ── */
let selected = { productId: null, tierId: null };
function openLicense(productId, tierId) {
  const p = productById(productId); if (!p) return;
  selected = { productId, tierId: tierId || defaultTierId() };
  $('lmTitle').textContent = 'License “' + p.name + '”';
  const prev = $('lmPreview');
  const wmText = (CONFIG.branding.businessName + '  ').repeat(60);
  prev.innerHTML = (p.previewUrl
      ? `<img src="${esc(p.previewUrl)}" alt="${esc(p.name)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.remove()">`
      : `<div class="ph">${esc(p.name)}</div>`)
    + `<div class="wm" data-wm="${esc(wmText)}"></div>`;
  renderTierOpts(p);
  $('licenseModal').classList.add('open');
}
function renderTierOpts(p) {
  const wrap = $('lmTiers');
  wrap.innerHTML = CONFIG.tiers.map(t =>
    `<div class="tieropt ${t.id === selected.tierId ? 'sel' : ''}" data-tier="${t.id}">
       <span class="radio"></span>
       <span class="info"><span class="n">${esc(t.name)}</span><span class="b">${esc(t.blurb || '')}</span></span>
       <span class="price">${money(priceFor(p, t.id), t.currency)}</span>
     </div>`).join('');
  wrap.querySelectorAll('.tieropt').forEach(o => o.addEventListener('click', () => {
    selected.tierId = o.dataset.tier;
    renderTierOpts(p);
  }));
}

/* ── Checkout via Shopify Storefront API ── */
async function checkout() {
  const p = productById(selected.productId);
  const t = tierById(selected.tierId);
  if (!p || !t) return;
  const variantId = p.variants ? p.variants[t.id] : null;
  const sf = CONFIG.shopify;

  if (!sf.storefrontDomain || !sf.storefrontAccessToken || !variantId) {
    toast('Checkout not wired yet — set shopify.* + variant IDs in config.json', 'warn', 4200);
    console.info('[LogoVault] checkout stub: would buy', { product: p.id, tier: t.id, variantId });
    return;
  }

  const btn = $('lmCheckout'); btn.disabled = true; const label = btn.textContent; btn.textContent = 'Starting checkout…';
  try {
    const endpoint = `https://${sf.storefrontDomain}/api/${sf.apiVersion}/graphql.json`;
    const query = `mutation cartCreate($lines:[CartLineInput!]!){
      cartCreate(input:{lines:$lines}){ cart{ checkoutUrl } userErrors{ message } }
    }`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': sf.storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables: { lines: [{ quantity: 1, merchandiseId: variantId }] } }),
    });
    const json = await res.json();
    const errs = json?.data?.cartCreate?.userErrors;
    const url = json?.data?.cartCreate?.cart?.checkoutUrl;
    if (errs && errs.length) throw new Error(errs.map(e => e.message).join('; '));
    if (!url) throw new Error('No checkout URL returned');
    // remember the pending purchase so Redeem can prefill after return
    try { localStorage.setItem('lv:lastIntent', JSON.stringify({ productId: p.id, tierId: t.id })); } catch (_) {}
    window.location.href = url; // → Shopify checkout
  } catch (e) {
    console.error(e);
    toast('Checkout failed: ' + e.message, 'err', 4200);
    btn.disabled = false; btn.textContent = label;
  }
}

/* ── Secure download (post-purchase) ── */
function fillRedeemSelects() {
  const pSel = $('rdProduct'), tSel = $('rdTier');
  pSel.innerHTML = CONFIG.catalog.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  tSel.innerHTML = CONFIG.tiers.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  try {
    const last = JSON.parse(localStorage.getItem('lv:lastIntent') || 'null');
    if (last) { pSel.value = last.productId; tSel.value = last.tierId; }
  } catch (_) {}
}

async function redeem() {
  const orderRef = $('rdOrder').value.trim();
  const productId = $('rdProduct').value;
  const tierId = $('rdTier').value;
  const p = productById(productId);
  const result = $('rdResult');
  if (!orderRef) { toast('Enter your order reference', 'warn'); return; }
  if (!p || !p.assetPath) { toast('This item has no asset configured', 'err'); return; }

  const btn = $('rdGet'); btn.disabled = true; const label = btn.textContent; btn.textContent = 'Verifying…';
  result.classList.remove('show');
  try {
    let url;
    if (CONFIG.backend.signerEndpoint) {
      // Secure path: server verifies the Shopify order, then signs the asset.
      const res = await fetch(CONFIG.backend.signerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderRef, productId, tierId, assetPath: p.assetPath, bucket: CONFIG.backend.assetBucket }),
      });
      if (!res.ok) throw new Error('Not entitled (' + res.status + ')');
      const json = await res.json();
      url = json.signedUrl || json.url;
      if (!url) throw new Error('Signer returned no URL');
    } else {
      // Demo fallback: sign directly from the browser. Insecure — anyone could
      // request without a real purchase. Production MUST set signerEndpoint.
      const { data, error } = await sb.storage
        .from(CONFIG.backend.assetBucket)
        .createSignedUrl(p.assetPath, CONFIG.backend.signedUrlTtlSeconds);
      if (error) throw error;
      url = data.signedUrl;
      console.warn('[LogoVault] demo signing (no signerEndpoint) — not order-verified');
    }
    result.innerHTML = `Clean file ready (link expires in ${Math.round(CONFIG.backend.signedUrlTtlSeconds/60)} min):<br><a href="${esc(url)}" download>${esc(p.name)} — download</a>`;
    result.classList.add('show');
    toast('Download link ready', 'ok');
  } catch (e) {
    console.error(e);
    result.innerHTML = `<span style="color:var(--red)">Couldn’t verify that order for this item. ${esc(e.message)}</span>`;
    result.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

/* ── Modal plumbing ── */
function openModal(id){ $(id).classList.add('open'); }
function closeModal(el){ el.classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', e => closeModal(e.target.closest('.overlay'))));
document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeModal(o); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(closeModal); });
$('lmCheckout').addEventListener('click', checkout);
$('redeemBtn').addEventListener('click', () => { fillRedeemSelects(); openModal('redeemModal'); });
$('rdGet').addEventListener('click', redeem);

/* ── Toast ── */
let toastT;
function toast(msg, kind = 'ok', ms = 2600) {
  const el = $('toast');
  el.className = 'toast show ' + kind;
  $('toastMsg').textContent = msg;
  el.querySelector('.ic').textContent = kind === 'ok' ? '✓' : kind === 'warn' ? '!' : '×';
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), ms);
}

/* ── Boot ── */
async function boot() {
  CONFIG = await loadConfig();
  applyBranding(CONFIG);
  sb = supabase.createClient(CONFIG.backend.supabaseUrl, CONFIG.backend.supabaseAnonKey);
  renderTiers();
  renderCatalog();
}
boot();

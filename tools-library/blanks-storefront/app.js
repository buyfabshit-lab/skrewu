/* ============================================================
   Blanks Storefront — pick a blank, then design it.
   Fetches the ss-products function (S&S Activewear feed) and renders
   a catalog; each card's "Design this blank" opens the designer with
   that style pre-selected.

   Config-driven: config.json (same folder) or ?config=<url>, with a
   built-in default fallback. If the function is unreachable and
   demoFallback is on, a small demo catalog renders so the page still works.
   ============================================================ */

const DEFAULT_CONFIG = {
  branding: {
    businessName: 'Blanks',
    productName: 'Blanks',
    tagline: 'Pick a blank · design it',
    heroTitle: 'Choose your blank',
    heroSub: 'Every blank below is live from the catalog. Pick one and jump straight into the designer.',
    logoUrl: null,
    colors: { accent: '#6d5bef', accent2: '#5a49dd' },
  },
  // The ss-products function endpoint (see functions/ss-products).
  functionUrl: 'http://localhost:8787/ss-products',
  // Where "Design this blank" sends the customer. The chosen blank is appended
  // as query params: ?style=<id>&brand=<brand>&name=<styleName>&img=<image>.
  designerBaseUrl: 'https://REPLACE-with-your-designer-url/design',
  defaultLimit: 60,
  demoFallback: true,
};

// Recognizable stand-ins so the page renders before the function is wired.
const DEMO_BLANKS = [
  { id: 'demo-5000',  brand: 'Gildan',              styleName: '5000',  title: 'Heavy Cotton Tee',   category: 'T-Shirts', image: null },
  { id: 'demo-3001',  brand: 'Bella+Canvas',        styleName: '3001',  title: 'Unisex Jersey Tee',  category: 'T-Shirts', image: null },
  { id: 'demo-1717',  brand: 'Comfort Colors',      styleName: '1717',  title: 'Garment-Dyed Tee',   category: 'T-Shirts', image: null },
  { id: 'demo-6210',  brand: 'Next Level',          styleName: '6210',  title: 'CVC Crew Tee',       category: 'T-Shirts', image: null },
  { id: 'demo-18500', brand: 'Gildan',              styleName: '18500', title: 'Heavy Blend Hoodie', category: 'Fleece',   image: null },
  { id: 'demo-SS4500',brand: 'Independent Trading', styleName: 'SS4500',title: 'Midweight Hoodie',   category: 'Fleece',   image: null },
  { id: 'demo-S700',  brand: 'Champion',            styleName: 'S700',  title: 'Powerblend Hoodie',  category: 'Fleece',   image: null },
  { id: 'demo-DT6000',brand: 'District',            styleName: 'DT6000',title: 'Very Important Tee', category: 'T-Shirts', image: null },
];

let CONFIG = DEFAULT_CONFIG;
let ALL = [];

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

async function loadConfig() {
  const url = new URLSearchParams(location.search).get('config') || 'config.json';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('config ' + res.status);
    const raw = await res.json();
    return {
      branding: { ...DEFAULT_CONFIG.branding, ...(raw.branding || {}),
        colors: { ...DEFAULT_CONFIG.branding.colors, ...((raw.branding || {}).colors || {}) } },
      functionUrl: raw.functionUrl || DEFAULT_CONFIG.functionUrl,
      designerBaseUrl: raw.designerBaseUrl || DEFAULT_CONFIG.designerBaseUrl,
      defaultLimit: raw.defaultLimit || DEFAULT_CONFIG.defaultLimit,
      demoFallback: raw.demoFallback !== undefined ? raw.demoFallback : DEFAULT_CONFIG.demoFallback,
    };
  } catch (e) {
    console.info('[Blanks] using built-in default config (' + e.message + ')');
    return DEFAULT_CONFIG;
  }
}

function applyBranding(cfg) {
  const b = cfg.branding;
  document.title = b.productName + ' — Blanks';
  setText('brandName', b.productName);
  setText('brandTagline', b.tagline);
  setText('footBrand', b.productName);
  if (b.heroTitle) setText('heroTitle', b.heroTitle);
  if (b.heroSub) setText('heroSub', b.heroSub);
  if (b.logoUrl) { const el = $('brandLogo'); if (el) el.innerHTML = `<img src="${esc(b.logoUrl)}" alt="${esc(b.businessName)}" style="width:100%;height:100%;object-fit:cover;">`; }
  const c = b.colors || {}, root = document.documentElement.style;
  if (c.accent)  root.setProperty('--accent', c.accent);
  if (c.accent2) root.setProperty('--accent-2', c.accent2);
}
function setText(id, t){ const el = $(id); if (el) el.textContent = t; }

async function loadBlanks() {
  const sep = CONFIG.functionUrl.includes('?') ? '&' : '?';
  try {
    const res = await fetch(`${CONFIG.functionUrl}${sep}limit=${CONFIG.defaultLimit}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('feed ' + res.status);
    const data = await res.json();
    const blanks = Array.isArray(data) ? data : (data.blanks || []);
    if (!blanks.length) throw new Error('empty feed');
    ALL = blanks;
    hideBanner();
  } catch (e) {
    console.warn('[Blanks] ss-products unreachable:', e.message);
    if (CONFIG.demoFallback) {
      ALL = DEMO_BLANKS;
      showBanner('Showing demo blanks — connect the ss-products function (set functionUrl) for the live S&S catalog.');
    } else {
      ALL = [];
      showBanner('Catalog unavailable — the ss-products function isn’t responding.');
    }
  }
  render(ALL);
}

function render(rows) {
  const grid = $('grid');
  $('count').textContent = `${rows.length} blank${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) { grid.innerHTML = `<div class="empty">No blanks match.</div>`; return; }
  const tpl = $('cardTpl');
  grid.innerHTML = '';
  rows.forEach(b => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const thumb = node.querySelector('[data-thumb]');
    const ph = node.querySelector('[data-ph]');
    node.querySelector('[data-pn]').textContent = `${b.brand} ${b.styleName}`;
    node.querySelector('[data-cat]').textContent = b.category || '';
    if (!b.category) node.querySelector('[data-cat]').style.display = 'none';
    if (b.image) {
      const img = document.createElement('img');
      img.loading = 'lazy'; img.alt = `${b.brand} ${b.styleName}`; img.src = b.image;
      img.onerror = () => img.remove(); // fall back to placeholder
      thumb.insertBefore(img, ph);
    }
    node.querySelector('[data-brand]').textContent = b.brand || '';
    node.querySelector('[data-name]').innerHTML = `<span class="style">${esc(b.styleName)}</span> ${esc(b.title || '')}`;
    node.querySelector('[data-design]').addEventListener('click', () => design(b));
    grid.appendChild(node);
  });
}

function design(b) {
  const base = CONFIG.designerBaseUrl || '';
  if (!base || /REPLACE/i.test(base)) {
    toast('Set designerBaseUrl in config.json to wire “Design this blank”.');
    console.info('[Blanks] design intent:', b);
    return;
  }
  const sep = base.includes('?') ? '&' : '?';
  const url = `${base}${sep}style=${encodeURIComponent(b.id)}&brand=${encodeURIComponent(b.brand||'')}&name=${encodeURIComponent(b.styleName||'')}&img=${encodeURIComponent(b.image||'')}`;
  window.location.href = url;
}

function applySearch() {
  const q = $('search').value.trim().toLowerCase();
  if (!q) return render(ALL);
  render(ALL.filter(b => `${b.brand} ${b.styleName} ${b.title} ${b.category}`.toLowerCase().includes(q)));
}

function showBanner(msg){ $('bannerMsg').textContent = msg; $('banner').classList.add('show'); }
function hideBanner(){ $('banner').classList.remove('show'); }

let toastT;
function toast(msg){ const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=>el.classList.remove('show'), 3200); }

$('search').addEventListener('input', applySearch);

/* ── Boot ── */
(async function boot(){
  CONFIG = await loadConfig();
  applyBranding(CONFIG);
  await loadBlanks();
})();

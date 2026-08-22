/* ============ SKREW U · PERSONAL LOCKER ============ */
/* Config-driven per person (?who=<slug>). Logos + real-blank shirt mockups.   */

const SUPABASE_URL = 'https://qmztuagvxopahowexrum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // files only
const BUCKET = 'listing-photos';

/* Art lives behind the server door now — the key in your link is what opens it,
   and it only ever opens your own locker. */
const ACCESS_KEY = new URLSearchParams(location.search).get('k') || '';
async function api(action, payload = {}) {
  try {
    const res = await fetch('/api/locker', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, who: slug, key: ACCESS_KEY, ...payload }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
const $ = (id) => document.getElementById(id);

const slug = (new URLSearchParams(location.search).get('who') || 'rorion').toLowerCase().replace(/[^a-z0-9-]/g, '');
let person = { name: slug, slug, tagline: 'Your private locker', accent: '#c4f135' };

const TEE_PATH = 'M7.5 2 L2 5.5 L4 9.7 L7 8.2 V22 H17 V8.2 L20 9.7 L22 5.5 L16.5 2 C15.4 3.7 8.6 3.7 7.5 2 Z';
const SHIRT_COLORS = [
  { n: 'Black', h: '#141414' }, { n: 'White', h: '#e9e9e6' }, { n: 'Charcoal', h: '#39393b' },
  { n: 'Sand', h: '#d8c6a3' }, { n: 'Army', h: '#4a4e39' }, { n: 'Rust', h: '#8f2c22' },
];
const DEFAULT_PRINT = { x: 50, y: 42, scale: 26 };

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function teeSvg(color) {
  return `<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><path d="${TEE_PATH}" fill="${color}" stroke="rgba(255,255,255,0.14)" stroke-width="0.25" stroke-linejoin="round"/></svg>`;
}
function loadImg(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
}

let toastTimer;
function toast(msg, bad) {
  const t = $('toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

async function loadPerson() {
  try { const res = await fetch('people.json', { cache: 'no-store' }); if (res.ok) { const p = await res.json(); if (p[slug]) person = { ...person, ...p[slug] }; } } catch {}
  if (person.accent) document.documentElement.style.setProperty('--acid', person.accent);
  $('whoTag').textContent = person.name.toUpperCase();
  $('heroName').innerHTML = `${escapeHtml(person.name)}<span class="accent">.</span>`;
  document.title = `SKREWU · ${person.name}'s Locker`;
}

async function compressImage(dataUrl, maxWidth = 1600, quality = 0.9) {
  if (dataUrl.startsWith('data:image/svg')) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
      c.width = width; c.height = height; c.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(c.toDataURL('image/webp', quality));
    };
    img.onerror = () => resolve(dataUrl); img.src = dataUrl;
  });
}
function readFile(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file); }); }

async function uploadImageFile(file, subdir) {
  const compressed = await compressImage(await readFile(file));
  const blob = await (await fetch(compressed)).blob();
  const ext = blob.type.includes('svg') ? 'svg' : (blob.type.includes('png') ? 'png' : 'webp');
  const path = `locker/${slug}/${subdir}/${Date.now()}-${Math.round(performance.now())}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return { url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path };
}

/* ================= LOGOS ================= */
let logos = [];
async function loadLogos() {
  const r = await api('list', { table: 'logos' });
  if (!r.ok) { toast(r.error || 'Could not load logos', true); return; }
  logos = r.rows || []; renderVault();
}
function renderVault() {
  const grid = $('vault');
  $('vaultCount').textContent = logos.length ? `${logos.length} logo${logos.length === 1 ? '' : 's'}` : '';
  if (!logos.length) grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">Nothing in here yet. Drop your first logo above.</div>`;
  else {
    grid.innerHTML = logos.map(l => `
      <div class="logo-card" data-id="${l.id}">
        <button class="del" data-del="${l.id}" title="Remove">&times;</button>
        <div class="art"><img src="${l.url}" alt="${escapeHtml(l.name || 'logo')}"></div>
        <div class="cap">${escapeHtml(l.name || 'logo')}</div>
      </div>`).join('');
    grid.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => removeLogo(b.dataset.del)));
  }
  if (!$('builder').hidden) refreshLogoPick();
}
async function handleLogoFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (!files.length) { toast('Pick image files', true); return; }
  toast(`Uploading ${files.length}…`); let ok = 0;
  for (const file of files) {
    try {
      const { url, path } = await uploadImageFile(file, '');
      const r = await api('insert', { table: 'logos',
        row: { name: file.name.replace(/\.[^.]+$/, ''), url, storage_path: path } });
      if (!r.ok) throw new Error(r.error);
      logos.unshift(r.row); ok++; renderVault();
    } catch (e) { console.error(e); toast('One file failed: ' + (e.message || e), true); }
  }
  if (ok) toast(`${ok} logo${ok === 1 ? '' : 's'} in your locker`);
}
async function removeLogo(id) {
  const item = logos.find(l => l.id === id);
  if (!item || !confirm('Remove this logo?')) return;
  const r = await api('remove', { table: 'logos', id });
  if (!r.ok) { toast(r.error || 'Could not remove it', true); return; }
  if (item.storage_path) sb.storage.from(BUCKET).remove([item.storage_path]).catch(() => {});
  logos = logos.filter(l => l.id !== id); renderVault(); toast('Removed');
}

/* ================= GARMENTS (real blank photos) ================= */
let garments = [];
async function loadGarments() {
  const r = await api('list', { table: 'garments' });
  if (!r.ok) { console.error(r.error); return; }
  garments = r.rows || [];
}
async function handleGarmentFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  toast('Adding blank…');
  for (const file of files) {
    try {
      const { url, path } = await uploadImageFile(file, 'blanks');
      const r = await api('insert', { table: 'garments',
        row: { name: file.name.replace(/\.[^.]+$/, ''), url, storage_path: path } });
      if (!r.ok) throw new Error(r.error);
      const row = r.row; garments.unshift(row);
      base = { type: 'photo', garment: row };
      refreshGarmentPick(); setMockDom();
    } catch (e) { console.error(e); toast('Blank upload failed: ' + (e.message || e), true); }
  }
  toast('Blank added');
}
async function removeGarment(id, ev) {
  if (ev) ev.stopPropagation();
  const g = garments.find(x => x.id === id);
  if (!g || !confirm('Remove this blank?')) return;
  await api('remove', { table: 'garments', id });
  if (g.storage_path) sb.storage.from(BUCKET).remove([g.storage_path]).catch(() => {});
  garments = garments.filter(x => x.id !== id);
  if (base.type === 'photo' && base.garment && base.garment.id === id) { base = { type: 'color', color: SHIRT_COLORS[0].h }; }
  refreshGarmentPick(); setMockDom();
}

/* ================= SHIRT BUILDER ================= */
let shirts = [];
let bLogo = null;
let base = { type: 'color', color: SHIRT_COLORS[0].h, garment: null };
let print = { ...DEFAULT_PRINT };

async function loadShirts() {
  const r = await api('list', { table: 'shirts' });
  if (!r.ok) { console.error(r.error); return; }
  shirts = r.rows || []; renderShirts();
}
function shirtBaseHtml(s) {
  return s.base_url ? `<img class="sl-base" src="${s.base_url}" alt="">` : teeSvg(s.shirt_color || '#141414');
}
function shirtLogoHtml(s) {
  if (!s.logo_url) return '';
  const p = s.print || DEFAULT_PRINT;
  return `<img class="sl" src="${s.logo_url}" alt="" style="left:${p.x}%;top:${p.y}%;width:${p.scale}%">`;
}
function renderShirts() {
  const grid = $('shirts');
  $('shirtCount').textContent = shirts.length ? `${shirts.length} shirt${shirts.length === 1 ? '' : 's'}` : '';
  const add = `<button class="add-shirt" id="addShirt" type="button">&#43; Build a shirt</button>`;
  const cards = shirts.map(s => `
    <div class="shirt-card" data-id="${s.id}">
      <button class="del" data-delshirt="${s.id}" title="Remove">&times;</button>
      <div class="sm">${shirtBaseHtml(s)}${shirtLogoHtml(s)}</div>
      <div class="sbody">
        <div class="sname">${escapeHtml(s.name || 'Untitled')}</div>
        <div class="sprice">$${Number(s.price || 0).toFixed(2)}</div>
        <div class="sstatus">${s.listing_id ? 'On skrewu.com' : s.status === 'in_shop' ? 'In shop · draft' : 'Draft'}</div>
        <div class="srow">
          <button class="btn" data-post="${s.id}" type="button"${s.listing_id ? ' disabled' : ''}>${s.listing_id ? 'Posted ✓' : 'Post to SKREWU'}</button>
          <button class="btn" data-push="${s.id}" type="button">${s.status === 'in_shop' ? 'Pushed ✓' : 'Push to shop'}</button>
        </div>
      </div>
    </div>`).join('');
  grid.innerHTML = add + cards;
  $('addShirt').addEventListener('click', openBuilder);
  grid.querySelectorAll('[data-delshirt]').forEach(b => b.addEventListener('click', () => removeShirt(b.dataset.delshirt)));
  grid.querySelectorAll('[data-push]').forEach(b => b.addEventListener('click', () => pushToShop(b.dataset.push)));
  grid.querySelectorAll('[data-post]').forEach(b => b.addEventListener('click', () => openPost(b.dataset.post)));
}

/* ---- post a shirt to the public board ---- */
/* The board at skrewu.com does both jobs from one table, so the only thing
   this has to decide is which shape to send: an opening bid people bid up, or
   one price with nothing to bid on. */
let postingId = null;

function openPost(id) {
  const s = shirts.find(x => x.id === id);
  if (!s) return;
  if (!(s.mockup_url || s.logo_url)) { toast('That shirt has no image to post', true); return; }
  postingId = id;
  $('postShirtName').textContent = s.name || 'Untitled';
  $('postPrice').value = s.price ? Number(s.price).toFixed(2) : '';
  $('postBuyNow').value = '';
  $('postDays').value = '7';
  setPostMode('auction');
  $('postModal').hidden = false;
}
function closePost() { $('postModal').hidden = true; postingId = null; }

function setPostMode(mode) {
  const fixed = mode === 'fixed';
  $('postModal').dataset.mode = mode;
  $('modeAuction').classList.toggle('on', !fixed);
  $('modeFixed').classList.toggle('on', fixed);
  // Buy-now is an auction idea. At a fixed price it IS the price, so showing
  // the field would only invite someone to contradict themselves.
  $('buyNowRow').hidden = fixed;
  $('postPriceLabel').textContent = fixed ? 'Price' : 'Opening bid';
  $('postDays').value = fixed ? '30' : '7';
  $('postDaysHint').textContent = fixed ? 'How long it stays up.' : 'How long people can bid.';
}

async function submitPost() {
  if (!postingId) return;
  const mode = $('postModal').dataset.mode;
  const fixed = mode === 'fixed';
  const price = parseFloat($('postPrice').value);
  if (!(price > 0)) { toast(fixed ? 'Set a price' : 'Set an opening bid', true); return; }

  const buyNowRaw = $('postBuyNow').value.trim();
  const buyNowPrice = buyNowRaw ? parseFloat(buyNowRaw) : null;
  if (!fixed && buyNowPrice != null && !(buyNowPrice > price)) {
    toast('Buy-now has to be more than the opening bid', true); return;
  }

  const btn = $('postGo'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Posting…';
  try {
    const r = await api('post_to_site', {
      id: postingId, mode,
      price: fixed ? price : undefined,
      startPrice: fixed ? undefined : price,
      buyNowPrice: fixed ? undefined : buyNowPrice,
      days: parseFloat($('postDays').value) || undefined,
    });
    if (!r.ok) throw new Error(r.error);
    const s = shirts.find(x => x.id === postingId);
    if (s) { s.listing_id = r.listing.id; s.status = 'posted'; }
    renderShirts(); closePost();
    toast(fixed ? 'Listed on skrewu.com' : 'Auction live on skrewu.com');
  } catch (e) {
    toast('Post failed: ' + (e.message || e), true);
  } finally { btn.disabled = false; btn.textContent = orig; }
}

/* ---- builder preview ---- */
function baseHtml() {
  return base.type === 'photo' && base.garment ? `<img class="base-photo" src="${base.garment.url}" alt="">` : teeSvg(base.color);
}
function setMockDom() {
  const m = $('mock');
  m.innerHTML = baseHtml() + (bLogo
    ? `<img class="mock-logo" id="mockLogo" src="${bLogo.url}" alt="">`
    : `<div class="mock-empty">Pick a logo to place it on the shirt</div>`);
  $('placeHint').textContent = bLogo ? 'Drag the logo to place it' : '';
  positionOverlay();
  if (bLogo) attachDrag();
}
function positionOverlay() {
  const el = $('mockLogo'); if (!el) return;
  el.style.left = print.x + '%'; el.style.top = print.y + '%'; el.style.width = print.scale + '%';
}
function attachDrag() {
  const el = $('mockLogo'), mock = $('mock');
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); el.classList.add('drag'); el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = mock.getBoundingClientRect();
      print.x = Math.max(6, Math.min(94, ((ev.clientX - r.left) / r.width) * 100));
      print.y = Math.max(6, Math.min(94, ((ev.clientY - r.top) / r.height) * 100));
      positionOverlay();
    };
    const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  });
}

function refreshLogoPick() {
  const wrap = $('logoPick');
  if (!logos.length) { wrap.innerHTML = `<span class="none">Upload a logo first (up top).</span>`; return; }
  wrap.innerHTML = logos.map(l => `<button class="lp${bLogo && bLogo.id === l.id ? ' on' : ''}" data-pick="${l.id}" type="button"><img src="${l.url}" alt=""></button>`).join('');
  wrap.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    bLogo = logos.find(l => l.id === b.dataset.pick) || null;
    wrap.querySelectorAll('.lp').forEach(x => x.classList.remove('on')); b.classList.add('on');
    setMockDom();
  }));
}
function refreshGarmentPick() {
  const wrap = $('garmentPick');
  const tiles = garments.map(g => `
    <div class="gp${base.type === 'photo' && base.garment && base.garment.id === g.id ? ' on' : ''}" data-g="${g.id}" title="${escapeHtml(g.name || 'blank')}">
      <img src="${g.url}" alt=""><button class="gdel" data-gdel="${g.id}" title="Remove blank">&times;</button>
    </div>`).join('');
  wrap.innerHTML = tiles + `<button class="add-g" id="addGarment" type="button" title="Add a blank photo">&#43;</button>`;
  wrap.querySelectorAll('[data-g]').forEach(el => el.addEventListener('click', () => {
    base = { type: 'photo', garment: garments.find(g => g.id === el.dataset.g) };
    $('swatches').querySelectorAll('.sw').forEach(x => x.classList.remove('on'));
    refreshGarmentPick(); setMockDom();
  }));
  wrap.querySelectorAll('[data-gdel]').forEach(el => el.addEventListener('click', (e) => removeGarment(el.dataset.gdel, e)));
  $('addGarment').addEventListener('click', () => $('garmentInput').click());
}
function renderSwatches() {
  const wrap = $('swatches');
  wrap.innerHTML = SHIRT_COLORS.map(c => `<button class="sw${base.type === 'color' && c.h === base.color ? ' on' : ''}" data-color="${c.h}" title="${c.n}" style="background:${c.h}" type="button"></button>`).join('');
  wrap.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
    base = { type: 'color', color: b.dataset.color };
    $('garmentPick').querySelectorAll('.gp').forEach(x => x.classList.remove('on'));
    wrap.querySelectorAll('.sw').forEach(x => x.classList.remove('on')); b.classList.add('on');
    setMockDom();
  }));
}

function openBuilder() {
  bLogo = null; base = { type: 'color', color: SHIRT_COLORS[0].h, garment: null }; print = { ...DEFAULT_PRINT };
  $('shirtName').value = ''; $('shirtPrice').value = '';
  $('sizeRange').value = print.scale; $('sizeVal').textContent = print.scale + '%';
  refreshGarmentPick(); renderSwatches(); refreshLogoPick(); setMockDom();
  $('builder').hidden = false;
  $('builder').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function closeBuilder() { $('builder').hidden = true; }

/* ---- compose the final mockup image ---- */
async function composeMockup() {
  const size = 900;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  try {
    if (base.type === 'photo' && base.garment) {
      const bimg = await loadImg(base.garment.url);
      // contain the blank photo
      const r = Math.min(size / bimg.width, size / bimg.height);
      const w = bimg.width * r, h = bimg.height * r;
      ctx.fillStyle = '#0c0b09'; ctx.fillRect(0, 0, size, size);
      ctx.drawImage(bimg, (size - w) / 2, (size - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#0c0b09'; ctx.fillRect(0, 0, size, size);
      ctx.save(); ctx.scale(size / 24, size / 24);
      const p = new Path2D(TEE_PATH);
      ctx.fillStyle = base.color; ctx.fill(p);
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.25; ctx.stroke(p);
      ctx.restore();
    }
    if (bLogo) {
      const limg = await loadImg(bLogo.url);
      const targetW = (print.scale / 100) * size;
      const r = targetW / limg.width;
      const w = targetW, h = limg.height * r;
      ctx.drawImage(limg, (print.x / 100) * size - w / 2, (print.y / 100) * size - h / 2, w, h);
    }
    return await new Promise((resolve) => { try { c.toBlob(b => resolve(b), 'image/webp', 0.9); } catch { resolve(null); } });
  } catch { return null; }
}

async function saveShirt() {
  if (!bLogo) { toast('Pick a logo first', true); return; }
  const name = $('shirtName').value.trim();
  const price = $('shirtPrice').value.trim();
  if (!name) { toast('Name your shirt', true); return; }
  if (!price) { toast('Set a price', true); return; }

  const btn = $('saveShirt'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Saving…';
  try {
    let mockupUrl = null;
    const blob = await composeMockup();
    if (blob) {
      const path = `locker/${slug}/shirts/${Date.now()}.webp`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: false });
      if (!error) mockupUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const row = {
      name, price: Number(price), logo_url: bLogo.url,
      shirt_color: base.type === 'color' ? base.color : null,
      base_url: base.type === 'photo' && base.garment ? base.garment.url : null,
      print, mockup_url: mockupUrl, status: 'draft',
    };
    const r = await api('insert', { table: 'shirts', row });
    if (!r.ok) throw new Error(r.error);
    shirts.unshift(r.row); renderShirts(); closeBuilder(); toast('Shirt saved to your locker');
  } catch (e) { console.error(e); toast('Save failed: ' + (e.message || e), true); }
  finally { btn.disabled = false; btn.textContent = orig; }
}
async function removeShirt(id) {
  const s = shirts.find(x => x.id === id);
  if (!s || !confirm('Remove this shirt?')) return;
  const r = await api('remove', { table: 'shirts', id });
  if (!r.ok) { toast(r.error || 'Could not remove it', true); return; }
  shirts = shirts.filter(x => x.id !== id); renderShirts(); toast('Removed');
}
async function pushToShop(id) {
  const s = shirts.find(x => x.id === id);
  if (!s) return;
  toast('Pushing to shop…');
  try {
    const res = await fetch('/api/deploy-shopify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: s.name, description: `${person.name} — ${s.name}. Built in the SKREW U locker.`,
        price: s.price, imageUrl: s.mockup_url || s.logo_url || undefined, tags: [person.slug, 'locker'], publish: false,
      }),
    });
    const data = await res.json();
    if (data.ok) { await api('update', { table: 'shirts', id, patch: { status: 'in_shop' } }); s.status = 'in_shop'; renderShirts(); toast('Pushed to shop as a draft ✓'); }
    else toast(data.error && /configured/i.test(data.error) ? 'Connect Shopify first (token not set)' : ('Shop push failed: ' + (data.error || 'error')), true);
  } catch (e) { toast('Shop push failed: ' + (e.message || e), true); }
}

/* ---- wiring ---- */
const drop = $('drop'), fileInput = $('fileInput');
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { handleLogoFiles(e.target.files); fileInput.value = ''; });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleLogoFiles(e.dataTransfer.files); });

$('garmentInput').addEventListener('change', e => { handleGarmentFiles(e.target.files); e.target.value = ''; });
$('sizeRange').addEventListener('input', e => { print.scale = Number(e.target.value); $('sizeVal').textContent = print.scale + '%'; positionOverlay(); });
$('saveShirt').addEventListener('click', saveShirt);
$('cancelShirt').addEventListener('click', closeBuilder);

$('modeAuction').addEventListener('click', () => setPostMode('auction'));
$('modeFixed').addEventListener('click', () => setPostMode('fixed'));
$('postGo').addEventListener('click', submitPost);
$('postCancel').addEventListener('click', closePost);
$('postClose').addEventListener('click', closePost);
// Clicking the dark surround closes it; clicking inside the box must not.
$('postModal').addEventListener('click', e => { if (e.target === $('postModal')) closePost(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('postModal').hidden) closePost(); });

/* ---- go ---- */
(async () => { await loadPerson(); await Promise.all([loadLogos(), loadGarments(), loadShirts()]); })();

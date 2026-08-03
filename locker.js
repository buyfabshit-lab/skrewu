/* ============ SKREW U · PERSONAL LOCKER ============ */
/* One page, config-driven per person. ?who=<slug> picks whose locker.        */
/* Logos stay his; shirts are built from his logos.                            */

const SUPABASE_URL = 'https://qmztuagvxopahowexrum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET = 'listing-photos'; // existing public bucket, namespaced by slug
const $ = (id) => document.getElementById(id);

const slug = (new URLSearchParams(location.search).get('who') || 'rorion').toLowerCase().replace(/[^a-z0-9-]/g, '');
let person = { name: slug, slug, tagline: 'Your private locker', accent: '#c4f135' };

const TEE_PATH = 'M7.5 2 L2 5.5 L4 9.7 L7 8.2 V22 H17 V8.2 L20 9.7 L22 5.5 L16.5 2 C15.4 3.7 8.6 3.7 7.5 2 Z';
const SHIRT_COLORS = [
  { n: 'Black', h: '#141414' }, { n: 'White', h: '#e9e9e6' }, { n: 'Charcoal', h: '#39393b' },
  { n: 'Sand', h: '#d8c6a3' }, { n: 'Army', h: '#4a4e39' }, { n: 'Rust', h: '#8f2c22' },
];

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function teeSvg(color) {
  return `<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><path d="${TEE_PATH}" fill="${color}" stroke="rgba(255,255,255,0.14)" stroke-width="0.25" stroke-linejoin="round"/></svg>`;
}

/* ---- toast ---- */
let toastTimer;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---- person config ---- */
async function loadPerson() {
  try {
    const res = await fetch('people.json', { cache: 'no-store' });
    if (res.ok) { const people = await res.json(); if (people[slug]) person = { ...person, ...people[slug] }; }
  } catch { /* defaults */ }
  if (person.accent) document.documentElement.style.setProperty('--acid', person.accent);
  $('whoTag').textContent = person.name.toUpperCase();
  $('heroName').innerHTML = `${escapeHtml(person.name)}<span class="accent">.</span>`;
  document.title = `SKREWU · ${person.name}'s Locker`;
}

/* ---- image compression ---- */
async function compressImage(dataUrl, maxWidth = 1400, quality = 0.9) {
  if (dataUrl.startsWith('data:image/svg')) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/webp', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
function readFile(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = e => resolve(e.target.result); r.onerror = reject; r.readAsDataURL(file); });
}

/* ================= LOGOS ================= */
let logos = [];
async function loadLogos() {
  const { data, error } = await sb.from('locker_logos').select('*').eq('owner_slug', slug).order('created_at', { ascending: false });
  if (error) { console.error(error); toast('Could not load your logos', true); return; }
  logos = data || [];
  renderVault();
}
function renderVault() {
  const grid = $('vault');
  $('vaultCount').textContent = logos.length ? `${logos.length} logo${logos.length === 1 ? '' : 's'}` : '';
  if (!logos.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">Nothing in here yet. Drop your first logo above.</div>`;
  } else {
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
async function handleFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (!files.length) { toast('Pick image files', true); return; }
  toast(`Uploading ${files.length}…`);
  let ok = 0;
  for (const file of files) {
    try {
      const dataUrl = await readFile(file);
      const compressed = await compressImage(dataUrl);
      const blob = await (await fetch(compressed)).blob();
      const ext = blob.type.includes('svg') ? 'svg' : (blob.type.includes('png') ? 'png' : 'webp');
      const path = `locker/${slug}/${Date.now()}-${Math.round(performance.now())}.${ext}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (upErr) throw upErr;
      const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { data: row, error: insErr } = await sb.from('locker_logos')
        .insert({ owner_slug: slug, name: file.name.replace(/\.[^.]+$/, ''), url, storage_path: path }).select().single();
      if (insErr) throw insErr;
      logos.unshift(row); ok++; renderVault();
    } catch (e) { console.error(e); toast('One file failed: ' + (e.message || e), true); }
  }
  if (ok) toast(`${ok} logo${ok === 1 ? '' : 's'} in your locker`);
}
async function removeLogo(id) {
  const item = logos.find(l => l.id === id);
  if (!item || !confirm('Remove this logo?')) return;
  const { error } = await sb.from('locker_logos').delete().eq('id', id);
  if (error) { toast('Could not remove it', true); return; }
  if (item.storage_path) sb.storage.from(BUCKET).remove([item.storage_path]).catch(() => {});
  logos = logos.filter(l => l.id !== id); renderVault(); toast('Removed');
}

/* ================= SHIRTS ================= */
let shirts = [];
let bLogo = null, bColor = SHIRT_COLORS[0].h;

async function loadShirts() {
  const { data, error } = await sb.from('locker_shirts').select('*').eq('owner_slug', slug).order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  shirts = data || [];
  renderShirts();
}
function renderShirts() {
  const grid = $('shirts');
  $('shirtCount').textContent = shirts.length ? `${shirts.length} shirt${shirts.length === 1 ? '' : 's'}` : '';
  const add = `<button class="add-shirt" id="addShirt" type="button">&#43; Build a shirt</button>`;
  const cards = shirts.map(s => `
    <div class="shirt-card" data-id="${s.id}">
      <button class="del" data-delshirt="${s.id}" title="Remove">&times;</button>
      <div class="sm">${teeSvg(s.shirt_color || '#141414')}${s.logo_url ? `<img class="sl" src="${s.logo_url}" alt="">` : ''}</div>
      <div class="sbody">
        <div class="sname">${escapeHtml(s.name || 'Untitled')}</div>
        <div class="sprice">$${Number(s.price || 0).toFixed(2)}</div>
        <div class="sstatus">${s.status === 'in_shop' ? 'In shop · draft' : 'Draft'}</div>
        <div class="srow"><button class="btn" data-push="${s.id}" type="button">${s.status === 'in_shop' ? 'Pushed ✓' : 'Push to shop'}</button></div>
      </div>
    </div>`).join('');
  grid.innerHTML = add + cards;
  $('addShirt').addEventListener('click', openBuilder);
  grid.querySelectorAll('[data-delshirt]').forEach(b => b.addEventListener('click', () => removeShirt(b.dataset.delshirt)));
  grid.querySelectorAll('[data-push]').forEach(b => b.addEventListener('click', () => pushToShop(b.dataset.push)));
}

function renderMock() {
  const m = $('mock');
  m.innerHTML = teeSvg(bColor) + (bLogo
    ? `<img class="mock-logo" src="${bLogo.url}" alt="">`
    : `<div class="mock-empty">Pick a logo to see it on the shirt</div>`);
}
function refreshLogoPick() {
  const wrap = $('logoPick');
  if (!logos.length) { wrap.innerHTML = `<span class="none">Upload a logo first (up top).</span>`; return; }
  wrap.innerHTML = logos.map(l => `<button class="lp${bLogo && bLogo.id === l.id ? ' on' : ''}" data-pick="${l.id}" type="button"><img src="${l.url}" alt="${escapeHtml(l.name || '')}"></button>`).join('');
  wrap.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    bLogo = logos.find(l => l.id === b.dataset.pick) || null;
    wrap.querySelectorAll('.lp').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); renderMock();
  }));
}
function renderSwatches() {
  const wrap = $('swatches');
  wrap.innerHTML = SHIRT_COLORS.map(c => `<button class="sw${c.h === bColor ? ' on' : ''}" data-color="${c.h}" title="${c.n}" style="background:${c.h}" type="button"></button>`).join('');
  wrap.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
    bColor = b.dataset.color;
    wrap.querySelectorAll('.sw').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); renderMock();
  }));
}
function openBuilder() {
  bLogo = null; bColor = SHIRT_COLORS[0].h;
  $('shirtName').value = ''; $('shirtPrice').value = '';
  refreshLogoPick(); renderSwatches(); renderMock();
  $('builder').hidden = false;
  $('builder').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function closeBuilder() { $('builder').hidden = true; }

// Best-effort composited shirt image for the shop (falls back to null if blocked).
async function makeMockup(color, logoUrl) {
  return new Promise((resolve) => {
    try {
      const size = 760;
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0c0b09'; ctx.fillRect(0, 0, size, size);
      ctx.save(); ctx.scale(size / 24, size / 24);
      const p = new Path2D(TEE_PATH);
      ctx.fillStyle = color; ctx.fill(p);
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.25; ctx.stroke(p);
      ctx.restore();
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const boxW = size * 0.24, boxH = size * 0.22, cx = size * 0.5, cy = size * 0.41;
        const r = Math.min(boxW / img.width, boxH / img.height);
        const w = img.width * r, h = img.height * r;
        try { ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h); c.toBlob(b => resolve(b), 'image/webp', 0.9); }
        catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    } catch { resolve(null); }
  });
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
    const blob = await makeMockup(bColor, bLogo.url);
    if (blob) {
      const path = `locker/${slug}/shirts/${Date.now()}.webp`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: false });
      if (!upErr) mockupUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }
    const { data: row, error } = await sb.from('locker_shirts').insert({
      owner_slug: slug, name, price: Number(price), logo_url: bLogo.url, shirt_color: bColor, mockup_url: mockupUrl, status: 'draft',
    }).select().single();
    if (error) throw error;
    shirts.unshift(row); renderShirts(); closeBuilder(); toast('Shirt saved to your locker');
  } catch (e) { console.error(e); toast('Save failed: ' + (e.message || e), true); }
  finally { btn.disabled = false; btn.textContent = orig; }
}

async function removeShirt(id) {
  const s = shirts.find(x => x.id === id);
  if (!s || !confirm('Remove this shirt?')) return;
  const { error } = await sb.from('locker_shirts').delete().eq('id', id);
  if (error) { toast('Could not remove it', true); return; }
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
        title: s.name,
        description: `${person.name} — ${s.name}. Built in the SKREW U locker.`,
        price: s.price,
        imageUrl: s.mockup_url || s.logo_url || undefined,
        tags: [person.slug, 'locker'],
        publish: false,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      await sb.from('locker_shirts').update({ status: 'in_shop' }).eq('id', id);
      s.status = 'in_shop'; renderShirts();
      toast('Pushed to shop as a draft ✓');
    } else {
      toast(data.error && /configured/i.test(data.error) ? 'Connect Shopify first (token not set)' : ('Shop push failed: ' + (data.error || 'error')), true);
    }
  } catch (e) { toast('Shop push failed: ' + (e.message || e), true); }
}

/* ---- dropzone wiring ---- */
const drop = $('drop'), fileInput = $('fileInput');
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { handleFiles(e.target.files); fileInput.value = ''; });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

/* ---- builder wiring ---- */
$('saveShirt').addEventListener('click', saveShirt);
$('cancelShirt').addEventListener('click', closeBuilder);

/* ---- go ---- */
(async () => { await loadPerson(); await Promise.all([loadLogos(), loadShirts()]); })();

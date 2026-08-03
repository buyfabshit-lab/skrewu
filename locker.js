/* ============ SKREW U · PERSONAL LOCKER ============ */
/* One page, config-driven per person. ?who=<slug> picks whose locker.        */
/* Each person's logos live under their slug — his stay his.                   */

const SUPABASE_URL = 'https://qmztuagvxopahowexrum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LOGO_BUCKET = 'listing-photos'; // reuse existing public bucket, namespaced by slug
const $ = (id) => document.getElementById(id);

const slug = (new URLSearchParams(location.search).get('who') || 'rorion').toLowerCase().replace(/[^a-z0-9-]/g, '');
let person = { name: slug, slug, tagline: 'Your private locker', accent: '#c4f135' };

/* ---- toast ---- */
let toastTimer;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---- load person config ---- */
async function loadPerson() {
  try {
    const res = await fetch('people.json', { cache: 'no-store' });
    if (res.ok) {
      const people = await res.json();
      if (people[slug]) person = { ...person, ...people[slug] };
    }
  } catch { /* fall back to defaults */ }
  if (person.accent) document.documentElement.style.setProperty('--acid', person.accent);
  $('whoTag').textContent = person.name.toUpperCase();
  $('heroName').innerHTML = `${escapeHtml(person.name)}<span class="accent">.</span>`;
  document.title = `SKREWU · ${person.name}'s Locker`;
}

/* ---- image compression ---- */
async function compressImage(dataUrl, maxWidth = 1400, quality = 0.9) {
  // Skip SVG — keep it vector.
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

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

/* ---- vault: load + render ---- */
let logos = [];
async function loadLogos() {
  const { data, error } = await sb.from('locker_logos')
    .select('*').eq('owner_slug', slug).order('created_at', { ascending: false });
  if (error) { console.error(error); toast('Could not load your locker', true); return; }
  logos = data || [];
  renderVault();
}

function renderVault() {
  const grid = $('vault');
  $('vaultCount').textContent = logos.length ? `${logos.length} logo${logos.length === 1 ? '' : 's'}` : '';
  if (!logos.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">Nothing in here yet. Drop your first logo above.</div>`;
    return;
  }
  grid.innerHTML = logos.map(l => `
    <div class="logo-card" data-id="${l.id}">
      <button class="del" data-del="${l.id}" title="Remove">&times;</button>
      <div class="art"><img src="${l.url}" alt="${escapeHtml(l.name || 'logo')}"></div>
      <div class="cap">${escapeHtml(l.name || 'logo')}</div>
    </div>`).join('');
  grid.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => removeLogo(b.dataset.del)));
}

/* ---- upload ---- */
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
      const { error: upErr } = await sb.storage.from(LOGO_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
      if (upErr) throw upErr;
      const url = sb.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
      const { data: row, error: insErr } = await sb.from('locker_logos')
        .insert({ owner_slug: slug, name: file.name.replace(/\.[^.]+$/, ''), url, storage_path: path })
        .select().single();
      if (insErr) throw insErr;
      logos.unshift(row);
      ok++;
      renderVault();
    } catch (e) {
      console.error(e);
      toast('One file failed: ' + (e.message || e), true);
    }
  }
  if (ok) toast(`${ok} logo${ok === 1 ? '' : 's'} in your locker`);
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function removeLogo(id) {
  const item = logos.find(l => l.id === id);
  if (!item) return;
  if (!confirm('Remove this logo from your locker?')) return;
  const { error } = await sb.from('locker_logos').delete().eq('id', id);
  if (error) { toast('Could not remove it', true); return; }
  if (item.storage_path) sb.storage.from(LOGO_BUCKET).remove([item.storage_path]).catch(() => {});
  logos = logos.filter(l => l.id !== id);
  renderVault();
  toast('Removed');
}

/* ---- wire dropzone ---- */
const drop = $('drop'), fileInput = $('fileInput');
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { handleFiles(e.target.files); fileInput.value = ''; });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

/* ---- go ---- */
(async () => { await loadPerson(); await loadLogos(); })();

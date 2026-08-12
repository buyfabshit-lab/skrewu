/* ============ BLANKS ============ */
/* Browse the supplier catalogue by brand and line, tick what you'd actually  */
/* print, and it becomes your shop's blank list. Everything downstream — the  */
/* Shirts Studio, the mockups — then works from your ten, not the supplier's  */
/* ten thousand.                                                              */
/*                                                                            */
/*   blanks.html?who=<slug>&k=<access key>                                    */
/*                                                                            */
/* Picked blanks are saved through /api/locker, so they land behind the same  */
/* wall as everything else that belongs to a shop.                            */

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const p = new URLSearchParams(location.search);
  const who = (p.get('who') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const key = p.get('k') || '';

  let blanks = [], brands = [], cats = [];
  let brand = '', category = '', search = '';
  const picked = new Map();      // id -> blank
  const already = new Set();     // "brand|style" already in this shop

  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  const keyOf = (b) => `${b.brand}|${b.style}`;

  async function locker(action, payload) {
    const res = await fetch('/api/locker', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, who, key, ...payload }),
    });
    return await res.json();
  }

  /* What's already in the shop, so we never offer to add it twice. */
  async function loadMine() {
    if (!who || !key) return;
    try {
      const r = await locker('list', { table: 'garments' });
      if (!r.ok) return;
      (r.rows || []).forEach(g => { if (g.style) already.add(`${g.brand}|${g.style}`); });
    } catch { /* the catalogue still works without it */ }
  }

  async function load() {
    const qs = new URLSearchParams({ limit: '120' });
    if (brand) qs.set('brand', brand);
    if (category) qs.set('category', category);
    if (search) qs.set('search', search);
    $('grid').innerHTML = '<div class="none">Loading…</div>';
    try {
      const res = await fetch('/api/blanks?' + qs.toString(), { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) { $('grid').innerHTML = `<div class="none">${esc(data.error || 'Catalogue unavailable')}</div>`; return; }
      blanks = data.blanks || [];
      if (!brands.length) { brands = data.brands || []; cats = data.categories || []; renderChips(); }
      if (!data.live) {
        $('warn').style.display = '';
        $('warn').innerHTML = `<b>Stand-ins, not the real catalogue.</b> ${esc(data.why || '')}`;
      }
      renderGrid();
    } catch (e) {
      $('grid').innerHTML = `<div class="none">Couldn’t reach the catalogue: ${esc(e.message)}</div>`;
    }
  }

  function renderChips() {
    $('brands').innerHTML = '<span class="chips-l">Brand</span>' +
      `<button class="chip${brand ? '' : ' on'}" data-b="" type="button">All</button>` +
      brands.slice(0, 14).map(b =>
        `<button class="chip${brand === b.name.toLowerCase() ? ' on' : ''}" data-b="${esc(b.name)}" type="button">${esc(b.name)}<span class="n">${b.n}</span></button>`
      ).join('');
    $('cats').innerHTML = '<span class="chips-l">Line</span>' +
      `<button class="chip${category ? '' : ' on'}" data-c="" type="button">All</button>` +
      cats.slice(0, 12).map(c =>
        `<button class="chip${category === c.name.toLowerCase() ? ' on' : ''}" data-c="${esc(c.name)}" type="button">${esc(c.name)}<span class="n">${c.n}</span></button>`
      ).join('');

    $('brands').querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => {
      brand = b.dataset.b.toLowerCase(); renderChips(); load();
    }));
    $('cats').querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
      category = b.dataset.c.toLowerCase(); renderChips(); load();
    }));
  }

  function renderGrid() {
    if (!blanks.length) { $('grid').innerHTML = '<div class="none">Nothing matches that.</div>'; return; }
    $('grid').innerHTML = blanks.map(b => {
      const have = already.has(keyOf(b));
      return `
      <button class="b${picked.has(b.id) ? ' on' : ''}" data-id="${esc(b.id)}" type="button"
              ${have ? 'disabled style="opacity:.45;cursor:default;"' : ''}>
        <span class="tick">✓</span>
        <span class="pic">${b.image ? `<img src="${esc(b.image)}" alt="" loading="lazy">` : '<span class="no">no photo</span>'}</span>
        <span class="m">
          <span class="br">${esc(b.brand)}</span>
          <span class="ti">${esc(b.title)}</span>
          <span class="st">${esc(b.style)}${have ? ' · already yours' : ''}</span>
        </span>
      </button>`;
    }).join('');

    $('grid').querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => {
      const b = blanks.find(x => x.id === el.dataset.id);
      if (!b || already.has(keyOf(b))) return;
      if (picked.has(b.id)) picked.delete(b.id); else picked.set(b.id, b);
      el.classList.toggle('on', picked.has(b.id));
      renderCount();
    }));
    renderCount();
  }

  function renderCount() {
    const n = picked.size;
    $('cnt').innerHTML = n
      ? `<b>${n}</b> picked — ${[...picked.values()].slice(0, 3).map(b => esc(b.brand + ' ' + b.style)).join(', ')}${n > 3 ? '…' : ''}`
      : 'Nothing picked yet.';
    $('add').disabled = !n;
  }

  async function addPicked() {
    if (!who || !key) { toast('Open this from your own shop link to save blanks', true); return; }
    const btn = $('add'); btn.disabled = true; const was = btn.textContent; btn.textContent = 'Adding…';
    let added = 0, failed = 0;
    for (const b of picked.values()) {
      const r = await locker('insert', { table: 'garments', row: {
        name: `${b.brand} ${b.style} — ${b.title}`,
        brand: b.brand, style: b.style, category: b.category,
        url: b.image, source: 'ss',
        // A supplier photo is on white. Nothing here has cut it out, so this
        // stays false until something actually does.
        transparent: false,
      }});
      if (r.ok) { added++; already.add(keyOf(b)); } else { failed++; }
    }
    picked.clear();
    btn.textContent = was;
    renderGrid();
    toast(failed ? `${added} added, ${failed} wouldn’t save` : `${added} added to your shop ✓`, !!failed);
  }

  $('q').addEventListener('input', (e) => {
    search = e.target.value.trim().toLowerCase();
    clearTimeout($('q')._t);
    $('q')._t = setTimeout(load, 260);
  });
  $('add').addEventListener('click', addPicked);
  $('mine').addEventListener('click', () => {
    if (!who) { toast('Open this from your own shop link', true); return; }
    location.href = `locker.html?who=${encodeURIComponent(who)}&k=${encodeURIComponent(key)}`;
  });

  loadMine().then(load);
})();

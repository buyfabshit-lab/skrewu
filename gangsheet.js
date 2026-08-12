/* ============ SKREW U · GANG SHEET BUILDER ============ */
/* Packs a person's logos onto a print-ready DTF sheet and exports a PNG.       */
/* Self-contained (own IIFE) so it doesn't collide with locker.js.              */
(function () {
  const SUPABASE_URL = 'https://qmztuagvxopahowexrum.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);
  const slug = (new URLSearchParams(location.search).get('who') || 'rorion').toLowerCase().replace(/[^a-z0-9-]/g, '');

  const DPI = 300;            // export resolution
  const PREVIEW_PPI = 38;     // on-screen pixels per inch
  const GUTTER_IN = 0.15;     // gap between pieces
  const WIDTHS = [22, 24];    // common DTF roll widths

  let widthIn = 22;
  let logos = [];             // {id, url, name}
  let picked = null;          // selected logo to add
  let items = [];             // {url, name, qty, wIn}
  const imgCache = {};        // url -> HTMLImageElement

  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function loadImg(url) {
    if (imgCache[url]) return Promise.resolve(imgCache[url]);
    return new Promise((resolve, reject) => {
      const i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = () => { imgCache[url] = i; resolve(i); };
      i.onerror = reject; i.src = url;
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  /* If a save folder was picked on the Board (desktop Chrome/Edge), also write
     the export straight into it. Returns the folder name, or null. */
  async function saveToBoardFolder(blob, fname) {
    try {
      if (!('indexedDB' in window)) return null;
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('skrewu-board', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const handle = await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readonly');
        const g = tx.objectStore('kv').get('artFolder');
        g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error);
      });
      if (!handle || !handle.createWritable && !handle.getFileHandle) return null;
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;
      const fh = await handle.getFileHandle(fname, { create: true });
      const w = await fh.createWritable();
      await w.write(blob); await w.close();
      return handle.name || 'your folder';
    } catch { return null; }
  }

  async function loadLogos() {
    const { data, error } = await sb.from('locker_logos').select('id,url,name').eq('owner_slug', slug).order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    logos = data || [];
    renderLogoPick();
  }
  function renderWidths() {
    const wrap = $('gsWidth');
    wrap.innerHTML = WIDTHS.map(w => `<button class="seg-b${w === widthIn ? ' on' : ''}" data-w="${w}" type="button">${w}"</button>`).join('');
    wrap.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => {
      widthIn = Number(b.dataset.w);
      wrap.querySelectorAll('.seg-b').forEach(x => x.classList.remove('on')); b.classList.add('on');
      draw();
    }));
  }
  function renderLogoPick() {
    const wrap = $('gsLogoPick');
    if (!logos.length) { wrap.innerHTML = `<span class="none">Upload a logo up top first.</span>`; return; }
    wrap.innerHTML = logos.map(l => `<button class="lp${picked && picked.id === l.id ? ' on' : ''}" data-p="${l.id}" type="button"><img src="${l.url}" alt=""></button>`).join('');
    wrap.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
      picked = logos.find(l => l.id === b.dataset.p) || null;
      wrap.querySelectorAll('.lp').forEach(x => x.classList.remove('on')); b.classList.add('on');
    }));
  }
  function renderItems() {
    const wrap = $('gsItems');
    if (!items.length) { wrap.innerHTML = `<div class="gs-empty">Nothing on the sheet yet — pick a logo, set copies + size, hit "Add to sheet".</div>`; return; }
    wrap.innerHTML = items.map((it, i) => `
      <div class="gs-item">
        <img src="${it.url}" alt="">
        <span class="gi-meta"><b>${esc(it.name || 'logo')}</b> — ${it.qty} × ${it.wIn}"</span>
        <button class="gi-del" data-i="${i}" type="button" title="Remove">&times;</button>
      </div>`).join('');
    wrap.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { items.splice(Number(b.dataset.i), 1); renderItems(); draw(); }));
  }

  // Row/shelf packing → list of placed pieces + total sheet height (inches).
  async function pack() {
    const copies = [];
    for (const it of items) {
      let img; try { img = await loadImg(it.url); } catch { continue; }
      const hIn = it.wIn * (img.naturalHeight / img.naturalWidth || 1);
      for (let k = 0; k < it.qty; k++) copies.push({ url: it.url, img, wIn: it.wIn, hIn });
    }
    copies.sort((a, b) => b.hIn - a.hIn); // tallest first packs tidier
    const placed = [];
    let x = GUTTER_IN, y = GUTTER_IN, rowH = 0;
    for (const c of copies) {
      if (x + c.wIn > widthIn - GUTTER_IN && x > GUTTER_IN) { y += rowH + GUTTER_IN; x = GUTTER_IN; rowH = 0; }
      placed.push({ ...c, x, y });
      x += c.wIn + GUTTER_IN;
      rowH = Math.max(rowH, c.hIn);
    }
    const totalHeightIn = placed.length ? y + rowH + GUTTER_IN : 1;
    return { placed, totalHeightIn };
  }

  function renderTo(ctx, ppi, placed) {
    for (const p of placed) {
      ctx.drawImage(p.img, p.x * ppi, p.y * ppi, p.wIn * ppi, p.hIn * ppi);
    }
  }

  async function draw() {
    const { placed, totalHeightIn } = await pack();
    const c = $('gsCanvas');
    c.width = Math.max(1, Math.round(widthIn * PREVIEW_PPI));
    c.height = Math.max(1, Math.round(totalHeightIn * PREVIEW_PPI));
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    renderTo(ctx, PREVIEW_PPI, placed);
    const count = placed.length;
    $('gsStats').textContent = count
      ? `${count} piece${count === 1 ? '' : 's'} · sheet ${widthIn}" × ${totalHeightIn.toFixed(1)}" · export @ ${DPI} DPI`
      : 'Empty sheet.';
    $('gsInfo').textContent = count ? `${count} pieces` : '';
    return { placed, totalHeightIn };
  }

  function addItem() {
    if (!picked) { toast('Pick a logo to add', true); return; }
    items.push({ url: picked.url, name: picked.name, qty: Number($('gsQty').value), wIn: Number($('gsSize').value) });
    renderItems(); draw();
    toast('Added to sheet');
  }

  async function exportPNG() {
    if (!items.length) { toast('Add something to the sheet first', true); return; }
    const btn = $('gsExport'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Rendering…';
    try {
      const { placed, totalHeightIn } = await pack();
      const full = document.createElement('canvas');
      full.width = Math.round(widthIn * DPI);
      full.height = Math.max(1, Math.round(totalHeightIn * DPI));
      const ctx = full.getContext('2d');
      renderTo(ctx, DPI, placed);
      const blob = await new Promise((resolve) => { try { full.toBlob(b => resolve(b), 'image/png'); } catch { resolve(null); } });
      if (!blob) { toast("Couldn't export (image blocked cross-origin)", true); return; }

      // Download it
      const fname = `${slug}-gangsheet-${widthIn}x${totalHeightIn.toFixed(1)}in.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      // Also drop it in the folder picked on the Board, if one is set on this device
      const folderName = await saveToBoardFolder(blob, fname);
      if (folderName) toast(`Saved to “${folderName}” ✓`);

      // Best-effort: save a copy to the locker (storage + table)
      try {
        const path = `locker/${slug}/gangsheets/${Date.now()}.png`;
        const { error: upErr } = await sb.storage.from('listing-photos').upload(path, blob, { contentType: 'image/png', upsert: false });
        if (!upErr) {
          const sheetUrl = sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl;
          await sb.from('locker_gang_sheets').insert({
            owner_slug: slug, name: fname, width_in: widthIn, height_in: Number(totalHeightIn.toFixed(2)),
            items, sheet_url: sheetUrl,
          });
        }
      } catch (e) { console.warn('sheet save skipped', e); }

      toast('Gang sheet exported ✓');
    } catch (e) { console.error(e); toast('Export failed: ' + (e.message || e), true); }
    finally { btn.disabled = false; btn.textContent = orig; }
  }

  // wire
  renderWidths();
  renderItems();
  $('gsQtyVal').textContent = $('gsQty').value + ' copies';
  $('gsSizeVal').textContent = $('gsSize').value + '"';
  $('gsQty').addEventListener('input', e => { $('gsQtyVal').textContent = e.target.value + ' copies'; });
  $('gsSize').addEventListener('input', e => { $('gsSizeVal').textContent = e.target.value + '"'; });
  $('gsAdd').addEventListener('click', addItem);
  $('gsClear').addEventListener('click', () => { items = []; renderItems(); draw(); });
  $('gsExport').addEventListener('click', exportPNG);

  loadLogos().then(draw);
})();

/* ============ SKREW U · UV STICKER SHEET BUILDER ============ */
/* Pick a sheet, drop art on it, drag it where you want it, export a print   */
/* file at 300 DPI. Works with no account at all — a locker link (?who=&k=)  */
/* just adds your saved logos to the tray.                                   */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /* ---- the sheets we print. Edit the prices; the sizes are real UV DTF. ----
     `variant` is the Shopify variant this size adds to the cart — from the
     "Custom UV Sticker Sheet" product on DEATH CORPS. Keep the price here in
     step with the price on that variant, or the cart will disagree with the
     screen. Set variant to null and this size just can't be ordered online. */
  const SHOP_DOMAIN = 'deathcorps.shop';
  const SHEETS = [
    { id: '4x4',   label: '4 × 4"',    wIn: 4,   hIn: 4,  price: 6,  variant: '45551940632662' },
    { id: '6x6',   label: '6 × 6"',    wIn: 6,   hIn: 6,  price: 11, variant: '45551940665430' },
    { id: 'ltr',   label: '8.5 × 11"', wIn: 8.5, hIn: 11, price: 18, variant: '45551940698198' },
    { id: '12x12', label: '12 × 12"',  wIn: 12,  hIn: 12, price: 26, variant: '45551940730966' },
    { id: '12x24', label: '12 × 24"',  wIn: 12,  hIn: 24, price: 45, variant: '45551940763734' },
  ];

  /* Where a finished print file goes so the shop order can point at it. */
  const SUPABASE_URL = 'https://qmztuagvxopahowexrum.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh';

  const DPI = 300;          // export resolution
  const PREVIEW_PPI = 60;   // on-screen pixels per inch before CSS scales it
  const GAP_IN = 0.125;     // gap between stickers so they can be peeled apart
  const MARGIN_IN = 0.125;  // keep art off the very edge of the sheet

  let sheet = SHEETS.find(s => s.id === 'ltr');   // the one most people order
  let art = [];             // {id, url, name, src}
  let picked = null;
  let pieces = [];          // {id, url, img, wIn, hIn, x, y}  — inches, top-left
  let selected = null;
  let seq = 0;

  const imgCache = {};
  function loadImg(url) {
    if (imgCache[url]) return Promise.resolve(imgCache[url]);
    return new Promise((resolve, reject) => {
      const i = new Image();
      if (!/^data:/.test(url)) i.crossOrigin = 'anonymous';
      i.onload = () => { imgCache[url] = i; resolve(i); };
      i.onerror = () => reject(new Error('could not load that art'));
      i.src = url;
    });
  }

  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ---------------- art tray ---------------- */
  function renderSizes() {
    $('sizes').innerHTML = SHEETS.map(s =>
      `<button class="seg-b${s.id === sheet.id ? ' on' : ''}" data-s="${s.id}" type="button">${s.label}<small>$${s.price}</small></button>`
    ).join('');
    $('sizes').querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
      sheet = SHEETS.find(s => s.id === b.dataset.s) || SHEETS[0];
      renderSizes();
      repack();           // a new sheet means everything gets laid out again
    }));
  }

  function renderTray() {
    const wrap = $('tray');
    if (!art.length) { wrap.innerHTML = '<span class="none">Nothing yet — drop a file above.</span>'; return; }
    wrap.innerHTML = art.map(a => `
      <button class="art${picked === a.id ? ' on' : ''}" data-a="${esc(a.id)}" type="button" title="${esc(a.name || '')}">
        <img src="${esc(a.url)}" alt="">
        ${a.src !== 'upload' ? `<span class="src">${esc(a.src)}</span>` : ''}
      </button>`).join('');
    wrap.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      picked = b.dataset.a; renderTray();
    }));
  }

  function addArt(items) {
    let first = null;
    items.forEach(a => { const id = 'a' + (++seq); art.push({ ...a, id }); if (!first) first = id; });
    if (first && !picked) picked = first;
    renderTray();
  }

  function takeFiles(files) {
    const list = [...files].filter(f => /^image\//.test(f.type));
    if (!list.length) { toast('Pick an image file', true); return; }
    let left = list.length;
    const got = [];
    list.forEach(f => {
      const r = new FileReader();
      r.onload = () => {
        got.push({ url: r.result, name: f.name.replace(/\.[^.]+$/, ''), src: 'upload' });
        if (--left === 0) { addArt(got); toast(`${got.length} added`); }
      };
      r.onerror = () => { if (--left === 0 && got.length) addArt(got); };
      r.readAsDataURL(f);
    });
  }

  /* Art you've already got: logos in your locker, and any art pack we ship. */
  const params = new URLSearchParams(location.search);
  const slug = (params.get('who') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const ACCESS_KEY = params.get('k') || '';

  async function loadLockerArt() {
    if (!slug || !ACCESS_KEY) return;
    try {
      const res = await fetch('/api/locker', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', table: 'logos', who: slug, key: ACCESS_KEY }),
      });
      const data = await res.json();
      if (!data.ok) return;
      addArt((data.rows || []).filter(r => r.url).map(r => ({ url: r.url, name: r.name, src: 'locker' })));
    } catch { /* no locker, no problem — uploads still work */ }
  }

  async function loadPackArt() {
    try {
      const res = await fetch('packs.json', { cache: 'no-store' });
      const data = await res.json();
      const flat = [];
      (data.packs || []).forEach(p => (p.art || []).forEach(u => flat.push({
        url: u, name: p.name, src: 'pack',
      })));
      if (flat.length) addArt(flat);
    } catch { /* no packs yet */ }
  }

  /* ---------------- laying the sheet out ---------------- */
  const usableW = () => sheet.wIn - MARGIN_IN * 2;
  const usableH = () => sheet.hIn - MARGIN_IN * 2;

  /* Rows, tallest first — the same way you'd lay them out by hand. Anything
     that runs off the bottom is marked so we can say so instead of hiding it. */
  function repack() {
    const sorted = [...pieces].sort((a, b) => b.hIn - a.hIn);
    let x = MARGIN_IN, y = MARGIN_IN, rowH = 0;
    sorted.forEach(p => {
      if (x + p.wIn > sheet.wIn - MARGIN_IN && x > MARGIN_IN) {
        y += rowH + GAP_IN; x = MARGIN_IN; rowH = 0;
      }
      p.x = x; p.y = y;
      x += p.wIn + GAP_IN;
      rowH = Math.max(rowH, p.hIn);
    });
    draw();
  }

  const fits = (p) => p.x >= -0.001 && p.y >= -0.001 &&
                      p.x + p.wIn <= sheet.wIn + 0.001 && p.y + p.hIn <= sheet.hIn + 0.001;

  function draw() {
    const c = $('sheet');
    c.width = Math.round(sheet.wIn * PREVIEW_PPI);
    c.height = Math.round(sheet.hIn * PREVIEW_PPI);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);

    pieces.forEach(p => {
      const ok = fits(p);
      ctx.globalAlpha = ok ? 1 : 0.35;
      ctx.drawImage(p.img, p.x * PREVIEW_PPI, p.y * PREVIEW_PPI, p.wIn * PREVIEW_PPI, p.hIn * PREVIEW_PPI);
      ctx.globalAlpha = 1;
      if (!ok || selected === p.id) {
        ctx.strokeStyle = ok ? '#c4f135' : '#c43a2c';
        ctx.lineWidth = 2;
        ctx.setLineDash(ok ? [] : [6, 4]);
        ctx.strokeRect(p.x * PREVIEW_PPI, p.y * PREVIEW_PPI, p.wIn * PREVIEW_PPI, p.hIn * PREVIEW_PPI);
        ctx.setLineDash([]);
      }
    });

    renderPieces();
    const n = pieces.length;
    const over = pieces.filter(p => !fits(p)).length;
    const used = pieces.filter(fits).reduce((s, p) => s + p.wIn * p.hIn, 0);
    const cover = usableW() * usableH() ? Math.round((used / (usableW() * usableH())) * 100) : 0;
    $('stats').textContent = n
      ? `${n} sticker${n === 1 ? '' : 's'} · ${sheet.label} sheet · ${cover}% of the sheet used`
      : 'Empty sheet.';
    $('overflow').textContent = over
      ? `${over} ${over === 1 ? "doesn't" : "don't"} fit — make them smaller, auto-arrange, or move up a sheet size.`
      : '';
    $('priceSize').textContent = sheet.label;
    $('priceVal').textContent = n ? '$' + sheet.price : '$0';
    $('order').textContent = n ? `Order this sheet — $${sheet.price}` : 'Order this sheet';
  }

  /* Twenty of the same sticker is one line that says twenty — not twenty lines. */
  function groups() {
    const by = new Map();
    pieces.forEach(p => {
      const k = p.url + '@' + p.wIn;
      if (!by.has(k)) by.set(k, { key: k, url: p.url, name: p.name, wIn: p.wIn, n: 0, off: 0 });
      const g = by.get(k);
      g.n++; if (!fits(p)) g.off++;
    });
    return [...by.values()];
  }

  function renderPieces() {
    const wrap = $('pieces');
    if (!pieces.length) { wrap.innerHTML = '<div class="empty">Nothing on the sheet yet.</div>'; return; }
    wrap.innerHTML = groups().map(g => `
      <div class="piece">
        <img src="${esc(g.url)}" alt="">
        <span class="m"><b>${esc(g.name || 'sticker')}</b> — ${g.n} × ${g.wIn}" wide${g.off ? ` · <span style="color:var(--ember)">${g.off} off the sheet</span>` : ''}</span>
        <button data-less="${esc(g.key)}" type="button" title="One fewer" style="font-size:14px;">−</button>
        <button data-more="${esc(g.key)}" type="button" title="One more" style="font-size:14px;">+</button>
        <button data-del="${esc(g.key)}" type="button" title="Remove them all">&times;</button>
      </div>`).join('');

    const keyOf = (p) => p.url + '@' + p.wIn;
    wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      pieces = pieces.filter(p => keyOf(p) !== b.dataset.del); selected = null; draw();
    }));
    wrap.querySelectorAll('[data-less]').forEach(b => b.addEventListener('click', () => {
      const i = pieces.map(keyOf).lastIndexOf(b.dataset.less);
      if (i >= 0) { pieces.splice(i, 1); repack(); }
    }));
    wrap.querySelectorAll('[data-more]').forEach(b => b.addEventListener('click', () => {
      const src = pieces.find(p => keyOf(p) === b.dataset.more);
      if (src) { pieces.push({ ...src, id: 'p' + (++seq) }); repack(); }
    }));
  }

  async function addPieces() {
    const a = art.find(x => x.id === picked);
    if (!a) { toast('Pick a piece of art first', true); return; }
    let img;
    try { img = await loadImg(a.url); } catch (e) { toast(e.message, true); return; }
    const wIn = Number($('size').value);
    const hIn = wIn * (img.naturalHeight / img.naturalWidth || 1);
    const qty = Number($('qty').value);
    for (let i = 0; i < qty; i++) {
      pieces.push({ id: 'p' + (++seq), url: a.url, name: a.name, img, wIn, hIn: Number(hIn.toFixed(3)), x: MARGIN_IN, y: MARGIN_IN });
    }
    repack();
    toast(`${qty} added`);
  }

  /* ---------------- drag a sticker where you want it ---------------- */
  const c = $('sheet');
  let dragging = null, grabDX = 0, grabDY = 0;

  function atEvent(e) {
    const r = c.getBoundingClientRect();
    return {
      xIn: ((e.clientX - r.left) / r.width) * sheet.wIn,
      yIn: ((e.clientY - r.top) / r.height) * sheet.hIn,
    };
  }
  c.addEventListener('pointerdown', (e) => {
    const { xIn, yIn } = atEvent(e);
    // topmost first — the one you can see is the one you grab
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      if (xIn >= p.x && xIn <= p.x + p.wIn && yIn >= p.y && yIn <= p.y + p.hIn) {
        dragging = p; grabDX = xIn - p.x; grabDY = yIn - p.y;
        selected = p.id;
        pieces.splice(i, 1); pieces.push(p);   // bring it to the front
        c.classList.add('dragging');
        c.setPointerCapture(e.pointerId);
        draw();
        return;
      }
    }
    selected = null; draw();
  });
  c.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const { xIn, yIn } = atEvent(e);
    dragging.x = Math.max(0, Math.min(sheet.wIn - dragging.wIn, xIn - grabDX));
    dragging.y = Math.max(0, Math.min(sheet.hIn - dragging.hIn, yIn - grabDY));
    draw();
  });
  const endDrag = () => { dragging = null; c.classList.remove('dragging'); };
  c.addEventListener('pointerup', endDrag);
  c.addEventListener('pointercancel', endDrag);

  /* ---------------- the finished print file ---------------- */
  /* One place that turns the sheet into a 300 DPI PNG — the download button and
     the shop order both want the same file. */
  async function composite() {
    const keep = pieces.filter(fits);
    if (!keep.length) return null;
    const full = document.createElement('canvas');
    full.width = Math.round(sheet.wIn * DPI);
    full.height = Math.round(sheet.hIn * DPI);
    const ctx = full.getContext('2d');
    keep.forEach(p => ctx.drawImage(p.img, p.x * DPI, p.y * DPI, p.wIn * DPI, p.hIn * DPI));
    return await new Promise(res => { try { full.toBlob(b => res(b), 'image/png'); } catch { res(null); } });
  }

  async function exportPNG() {
    const keep = pieces.filter(fits);
    if (!keep.length) { toast('Put something on the sheet first', true); return; }
    const btn = $('export'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Rendering…';
    try {
      const blob = await composite();
      if (!blob) { toast("Couldn't export — that art is blocked cross-origin", true); return; }

      const fname = `${slug || 'uv'}-sticker-sheet-${sheet.id}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Print file exported ✓');
    } catch (e) {
      toast('Export failed: ' + (e.message || e), true);
    } finally { btn.disabled = false; btn.textContent = orig; }
  }

  /* ---------------- order it from the shop ----------------
     The sheet they just built becomes a real print file, that file goes up so
     the order can point at it, and Shopify takes the money. The design travels
     with the line item, so the order that lands in OmniFlow already has the
     file attached — nobody has to email artwork back and forth. */
  async function orderIt() {
    if (!sheet.variant) { toast(`${sheet.label} isn’t set up in the shop yet`, true); return; }
    const keep = pieces.filter(fits);
    if (!keep.length) { toast('Put something on the sheet first', true); return; }

    const btn = $('order'); btn.disabled = true; const orig = btn.textContent;
    btn.textContent = 'Sending the file…';
    try {
      const blob = await composite();
      if (!blob) { toast("Couldn't build the print file — that art is blocked cross-origin", true); return; }

      const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const path = `sticker-orders/${stamp}.png`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/listing-photos/${path}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'image/png',
        },
        body: blob,
      });
      if (!up.ok) {
        toast("Couldn't send your design up — export it and we'll take it by email", true);
        return;
      }
      const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/listing-photos/${path}`;

      // Shopify wants the brackets on line-item properties left alone, so build
      // the query by hand rather than letting URLSearchParams escape them.
      const prop = (k, v) => `properties[${encodeURIComponent(k)}]=${encodeURIComponent(v)}`;
      const q = [
        `id=${encodeURIComponent(sheet.variant)}`,
        'quantity=1',
        prop('Sheet size', sheet.label),
        prop('Stickers on the sheet', String(keep.length)),
        prop('Print file', fileUrl),
      ].join('&');

      location.href = `https://${SHOP_DOMAIN}/cart/add?${q}`;
    } catch (e) {
      toast('Could not reach the shop: ' + (e.message || e), true);
    } finally { btn.disabled = false; btn.textContent = orig; }
  }

  /* Saving the layout to a locker only works when there's a locker to save to,
     and only for art that already lives somewhere — an uploaded file exists
     nowhere but this browser tab. Say so rather than half-saving it. */
  async function saveToLocker() {
    if (!slug || !ACCESS_KEY) {
      toast('Open this from your locker link to save sheets', true); return;
    }
    const keep = pieces.filter(fits);
    if (!keep.length) { toast('Put something on the sheet first', true); return; }
    if (keep.some(p => /^data:/.test(p.url))) {
      toast('Upload that art to your locker first, then it can be saved', true); return;
    }
    const btn = $('save'); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Saving…';
    try {
      const res = await fetch('/api/locker', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'insert', table: 'gangsheets', who: slug, key: ACCESS_KEY,
          row: {
            name: `UV sticker sheet · ${sheet.label}`,
            width_in: sheet.wIn, height_in: sheet.hIn,
            items: keep.map(p => ({ url: p.url, name: p.name, wIn: p.wIn, hIn: p.hIn, x: p.x, y: p.y })),
          },
        }),
      });
      const data = await res.json();
      if (data.ok) toast('Saved to your locker ✓');
      else toast(data.error || "Couldn't save it", true);
    } catch (e) {
      toast('Could not reach the locker: ' + e.message, true);
    } finally { btn.disabled = false; btn.textContent = orig; }
  }

  /* ---------------- wire it up ---------------- */
  $('drop').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', (e) => { takeFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => $('drop').addEventListener(ev, (e) => {
    e.preventDefault(); $('drop').classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => $('drop').addEventListener(ev, (e) => {
    e.preventDefault(); $('drop').classList.remove('over');
  }));
  $('drop').addEventListener('drop', (e) => { if (e.dataTransfer) takeFiles(e.dataTransfer.files); });

  $('size').addEventListener('input', e => { $('sizeVal').textContent = e.target.value + '"'; });
  $('qty').addEventListener('input', e => { $('qtyVal').textContent = e.target.value; });
  $('add').addEventListener('click', addPieces);
  $('repack').addEventListener('click', repack);
  $('clear').addEventListener('click', () => { pieces = []; selected = null; draw(); });
  $('order').addEventListener('click', orderIt);
  $('export').addEventListener('click', exportPNG);
  $('save').addEventListener('click', saveToLocker);

  renderSizes();
  renderTray();
  draw();
  loadLockerArt();
  loadPackArt();
})();

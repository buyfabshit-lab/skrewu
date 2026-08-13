/* ============ SKREW U · THE BOARD ============ */
/* n8n-style production line: every tool is a block, wires are the hand-offs. */
/* Drag blocks. Tap an OUT port then an IN port to wire. Tap a wire to cut.   */
/* Layout persists in localStorage; "Reset line" restores the default flow.   */

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'skrewu_board_v3';

/* ---- tiny IndexedDB store (holds real folder handles on desktop) ---- */
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('skrewu-board', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

/* ---- the catalog of steps ---- */
const TOOLS = {
  // `scope` keeps a node to its own part of a shared page — the Locker, the
  // Shirts Studio and the Gang Sheet all live on locker.html.
  locker:    { name: 'Locker',          desc: 'Logos in — each person’s own vault.',      href: 'locker.html?who=rorion', status: 'live', scope: '#drop, #vault' },
  logomaker: { name: 'Logo Maker',      desc: 'Strip backgrounds → clean print PNG.',      href: 'tools-library/gang-sheet-logo-maker/index.html', status: 'live' },
  vault:     { name: 'Design Vault',    desc: 'The big archive — browse licensed art.',    href: 'tools-library/logo-vault/index.html', status: 'live' },
  shirts:    { name: 'Shirts Studio',   desc: 'Logo on a real blank — listing mockup.',    href: 'locker.html?who=rorion', status: 'live', scope: '#builder, #shirts' },
  gangsheet: { name: 'Gang Sheet',      desc: 'Pack logos → 300 DPI DTF print file.',      href: 'locker.html?who=rorion', status: 'live', scope: '#gsCanvas, #gsWidth, #gsItems' },
  sticker:   { name: 'UV Stickers',     desc: 'Customer builds their own sticker sheet.',  href: 'sticker.html?shop=deathcorps', status: 'live' },
  blanks:    { name: 'Blanks Picker',   desc: 'Pick the blanks your shop actually sells.', href: 'blanks.html?who=deathcorps', status: 'key' },
  deploy:    { name: 'Deploy Panel',    desc: 'One button → push product to stores.',      href: 'deploy.html', status: 'key' },
  shopify:   { name: 'Shopify Store',   desc: 'DEATH CORPS — deathcorps.shop.',            href: 'https://deathcorps.shop', status: 'live' },
  tiktok:    { name: 'TikTok Shop',     desc: 'Waiting on Partner API keys.',              href: null, status: 'gated' },
  drive:     { name: 'Drive Backup',    desc: 'n8n auto-copies art to Google Drive.',      href: null, status: 'key' },
  live:      { name: 'Live Overlay',    desc: 'On-stream: orders as they land.',           href: null, status: 'key' },
  omniflow:  { name: 'OmniFlow Orders', desc: 'All channels’ orders, one console.',        href: 'tools-library/omniflow-command/index.html', status: 'live' },
  wholesale: { name: 'Wholesale Form',  desc: 'B2B multi-item order drop-off.',            href: 'tools-library/wholesale-order-form/index.html', status: 'live' },
  ticket:    { name: 'Print Ticket',    desc: 'NEVER BLANK job ticket + CAD sheet.',       href: null, status: 'manual' },
  press:     { name: 'Heat Press',      desc: 'Physical step — film on shirt.',            href: null, status: 'manual' },
  manifest:  { name: 'Ship Manifest',   desc: 'Pull & pack sheet — out the door.',         href: 'order-manifest.html', status: 'live' },
  tracking:  { name: 'Cust. Tracking',  desc: 'What the buyer sees after ordering.',       href: 'order-confirmation.html', status: 'live' },
  // The AI pieces are parts on the line like everything else — not their own
  // rooms. Give each one its page or endpoint in `href` when it's ready.
  aiimage:   { name: 'AI Image',        desc: 'Make art from a prompt.',                   href: 'aiimage.html', status: 'key' },
  aivideo:   { name: 'AI Video',        desc: 'Turn a design into a clip for the feed.',    href: 'aivideo.html', status: 'key' },
  fusion:    { name: 'Fusion Command',  desc: 'Your own AI — point it at your endpoint.',   href: null, status: 'key' },
  custom:    { name: 'Custom Step',     desc: 'Your own step in the line.',                href: null, status: 'manual' },
  folder:    { name: '📁 Folder',       desc: 'Where the files land.',                     href: null, status: 'manual' },
};
const STATUS_LABEL = { live: 'Wired', key: 'Needs key', gated: 'Gated', manual: 'Hands-on' };

/* ---- what each tool can actually DO (its buttons), and what runs them ---- */
const SERVICES = {
  supabase:  { name: 'Supabase',          note: 'your database + file storage', status: 'live' },
  drive:     { name: 'Google Drive',      note: 'folders + backup',             status: 'key'  },
  shopify:   { name: 'Shopify Admin API', note: 'DEATH CORPS store',            status: 'key'  },
  tiktok:    { name: 'TikTok Shop API',   note: 'partner API',                  status: 'gated'},
  ss:        { name: 'S&S Activewear',    note: 'blanks catalog feed',          status: 'key'  },
  anthropic: { name: 'Anthropic',         note: 'AI copy + vision',             status: 'key'  },
  bgremove:  { name: 'AI background cut', note: 'remove.bg / local model',      status: 'key'  },
  upscale:   { name: 'AI upscaler',       note: 'HD / enhance',                 status: 'key'  },
  vector:    { name: 'Vectorizer',        note: 'raster → SVG',                 status: 'key'  },
  n8n:       { name: 'n8n workflow',      note: 'your automation runner',       status: 'key'  },
  mine:      { name: 'My own API',        note: 'MidnightFusion backend',       status: 'key'  },
  hedra:     { name: 'Hedra',             note: 'AI video + avatars',           status: 'key'  },
  photoshop: { name: 'Photoshop',         note: 'Adobe — actions, edits, vectorize', status: 'key' },
  photoroom: { name: 'Photoroom',         note: 'cutouts + product shots',      status: 'key'  },
  browser:   { name: 'Runs in the app',   note: 'no service needed',            status: 'live' },
  folder:    { name: 'Local folder',      note: 'saves to your computer',       status: 'live' },
  hands:     { name: 'Hands-on',          note: 'you do this one',              status: 'manual'},
};

/* capability list per tool: [label, default service] */
const CAPS = {
  locker:    [['Upload a logo','supabase'], ['Store it in the vault','supabase'], ['Remove a logo','supabase'], ['Back it up','drive']],
  logomaker: [['Remove background','bgremove'], ['Enhance','upscale'], ['HD upscale','upscale'], ['Vectorize','vector'], ['Color fix','browser'], ['Sharpen','browser'], ['Export print PNG','browser']],
  vault:     [['Search the archive','supabase'], ['Filter by brand','supabase'], ['Signed download','supabase']],
  shirts:    [['Pick a blank photo','supabase'], ['Place + size the print','browser'], ['Build the mockup','browser'], ['Save the shirt','supabase'], ['Push to shop','shopify']],
  gangsheet: [['Pack the sheet','browser'], ['Export 300 DPI PNG','browser'], ['Save to folder','folder'], ['Keep a copy','supabase']],
  sticker:   [['Load their art','supabase'], ['Lay out the sheet','browser'], ['Export 300 DPI','browser'], ['Save the sheet','supabase'], ['Take the order','shopify']],
  blanks:    [['Load the catalogue','ss'], ['Filter by brand + line','browser'], ['Add to my shop','supabase']],
  deploy:    [['Write the description','anthropic'], ['Upload the image','supabase'], ['Create the product','shopify'], ['Send to TikTok','tiktok']],
  shopify:   [['Create product','shopify'], ['Update price/stock','shopify'], ['Read orders','shopify']],
  tiktok:    [['Authorize shop','tiktok'], ['Upload images','tiktok'], ['Create product','tiktok']],
  drive:     [['Watch for new art','n8n'], ['Copy into the folder','drive'], ['Mark it synced','supabase']],
  live:      [['Read the day','supabase'], ['Show each order','browser'], ['Show the shop','browser']],
  omniflow:  [['Pull in orders','supabase'], ['Sort + classify','browser'], ['Update status','supabase']],
  wholesale: [['Take the order','supabase'], ['Attach artwork','supabase'], ['Notify you','n8n']],
  ticket:    [['Build the job ticket','browser'], ['CAD / gang sheet','browser'], ['Print it','hands']],
  press:     [['Press the film','hands'], ['Quality check','hands']],
  manifest:  [['Build the pull sheet','supabase'], ['Mark shipped','supabase'], ['Tracking number','hands']],
  tracking:  [['Look up an order','supabase'], ['Show status','browser']],
  folder:    [['Set the folder','folder'], ['Files land here','folder']],
  aiimage:   [['Write the prompt','browser'], ['Make the image','mine'], ['Pay for the run','supabase'], ['Keep it','supabase']],
  aivideo:   [['Write the prompt','browser'], ['Make the clip','mine'], ['Pay for the run','supabase'], ['Save it','supabase']],
  fusion:    [['Send it over','mine'], ['Get the answer back','mine'], ['Keep it','supabase']],
  custom:    [['Step one','hands']],
};

/* ---- default production line ---- */
/* A board starts as one block, not a finished factory.
 *
 * It used to open with all thirteen steps already wired, which reads as
 * somebody else's line that you're allowed to rearrange. Starting from a single
 * Locker makes it yours: add the next step, then the one after, and the shape
 * of your shop is the thing you built rather than the thing you edited.
 *
 * The full line hasn't gone anywhere — it's the first entry in Setups, so it's
 * one tap away when you want it as an example or a starting point. */
function defaultState() {
  return {
    nodes: [{ id: 'n1', type: 'locker', x: 60, y: 210 }],
    wires: [],
  };
}

/* The whole shop, end to end. Kept as an example you can load, not as the
   thing you're handed on arrival. */
function fullLine() {
  return {
    nodes: [
      { id: 'n1', type: 'locker',    x: 60,   y: 210 },
      { id: 'n2', type: 'shirts',    x: 340,  y: 90  },
      { id: 'n3', type: 'deploy',    x: 620,  y: 90  },
      { id: 'n4', type: 'shopify',   x: 900,  y: 40  },
      { id: 'n5', type: 'tiktok',    x: 900,  y: 210 },
      { id: 'n6', type: 'omniflow',  x: 1180, y: 120 },
      { id: 'n7', type: 'manifest',  x: 1460, y: 120 },
      { id: 'n8', type: 'tracking',  x: 1460, y: 300 },
      { id: 'n9', type: 'gangsheet', x: 340,  y: 330 },
      { id: 'n10',type: 'ticket',    x: 620,  y: 330 },
      { id: 'n11',type: 'press',     x: 900,  y: 390 },
      { id: 'n12',type: 'drive',     x: 340,  y: 540 },
      { id: 'n13',type: 'folder',    x: 620,  y: 560, label: null },
    ],
    wires: [
      ['n1','n2'], ['n2','n3'], ['n3','n4'], ['n3','n5'],
      ['n4','n6'], ['n5','n6'], ['n6','n7'], ['n6','n8'],
      ['n1','n9'], ['n9','n10'], ['n10','n11'], ['n11','n7'],
      ['n1','n12'], ['n9','n13'],
    ],
  };
}

/* ---- state ---- */
let state;
try {
  state = JSON.parse(localStorage.getItem(STORE_KEY));
  if (!state || !Array.isArray(state.nodes)) {
    // rebuild the layout but keep any wiring/notes that survived
    const keep = state || {};
    state = defaultState();
    state.links = keep.links || {};
    state.notes = keep.notes || {};
  }
} catch { state = defaultState(); }

if (!state.links) state.links = {};   // "<type>:<capIndex>" -> serviceId
if (!state.notes) state.notes = {};     // "<type>:<capIndex>" -> setup details
if (!state.prompts) state.prompts = {}; // "<type>:<capIndex>" -> what you tell the AI
if (!state.costs) state.costs = {};     // "<type>:<capIndex>" -> your rate per run
const money = (v) => '$' + (Number(v) || 0).toFixed(Math.abs(v) < 1 && v ? 3 : 2);
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} }
function capsOf(type) { return CAPS[type] || CAPS.custom; }
function linkOf(type, i) {
  const k = type + ':' + i;
  return Object.prototype.hasOwnProperty.call(state.links, k) ? state.links[k] : capsOf(type)[i][1];
}
function wiredCount(type) {
  const caps = capsOf(type);
  let n = 0;
  caps.forEach((c, i) => { const s = SERVICES[linkOf(type, i)]; if (s && (s.status === 'live')) n++; });
  return { n, total: caps.length };
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

const canvas = $('canvas'), svg = $('wires'), viewport = $('viewport');
const zoomOuter = $('zoomOuter');
let armedOut = null; // node id whose OUT port is armed for wiring

/* ---- zoom (mobile fits the line; desktop can lean in) ---- */
let zoom = 1;
function applyZoom() {
  canvas.style.transform = `scale(${zoom})`;
  canvas.style.transformOrigin = '0 0';
  zoomOuter.style.width = (canvas.offsetWidth * zoom) + 'px';
  zoomOuter.style.height = (canvas.offsetHeight * zoom) + 'px';
}
function setZoom(z) { zoom = Math.max(0.12, Math.min(1.6, z)); applyZoom(); }

/* The board is endless — it stretches whenever a block reaches an edge. */
function growCanvas(rightEdge, bottomEdge) {
  let grew = false;
  if (rightEdge + 260 > canvas.offsetWidth)  { canvas.style.width  = (rightEdge + 600) + 'px'; grew = true; }
  if (bottomEdge + 260 > canvas.offsetHeight){ canvas.style.height = (bottomEdge + 600) + 'px'; grew = true; }
  if (grew) applyZoom();
}
function growToFitAll() {
  let r = 0, b = 0;
  state.nodes.forEach(n => { r = Math.max(r, n.x + 200); b = Math.max(b, n.y + 170); });
  growCanvas(r, b);
}
/* True fit: the whole line on screen, width AND height. */
function fitLine() {
  let maxX = 400, maxY = 300;
  state.nodes.forEach(n => { maxX = Math.max(maxX, n.x + 210); maxY = Math.max(maxY, n.y + 175); });
  setZoom(Math.min((viewport.clientWidth - 16) / maxX, (viewport.clientHeight - 16) / maxY));
  viewport.scrollLeft = 0; viewport.scrollTop = 0;
}

/* ---- rendering ---- */
function nodeEl(id) { return canvas.querySelector(`.node[data-id="${id}"]`); }

function renderNode(n) {
  const t = TOOLS[n.type] || TOOLS.custom;
  const el = document.createElement('div');
  el.className = 'node' + (n.type === 'folder' ? ' folder' : '');
  el.dataset.id = n.id;
  el.dataset.status = t.status;
  el.style.left = n.x + 'px';
  el.style.top = n.y + 'px';
  if (n.type === 'folder') {
    el.innerHTML = `
      <div class="head"><span class="dotst"></span><h3>Save location</h3><button class="rm" title="Remove">&times;</button></div>
      <div class="loc ${n.label ? '' : 'unset'}">${esc(n.label || 'No folder set')}</div>
      <div class="sub">${n.label ? 'files land here' : 'tap set folder'}</div>
      <div class="row"><button class="open" data-setfolder="1">Set folder</button></div>
      <span class="port in" data-port="in"></span>
      <span class="port out" data-port="out"></span>`;
  } else {
    const name = n.label || t.name;
    const w = wiredCount(n.type);
    if (w.n === w.total) el.classList.add('allgreen');
    el.innerHTML = `
      <div class="head"><span class="dotst"></span><h3>${esc(name)}</h3>
        <button class="exp" title="Open this tool's buttons (or double-click the block)">⤢</button>
        <button class="rm" title="Remove">&times;</button></div>
      <div class="body">
        <div class="desc">${esc(t.desc)}</div>
        <div class="row">
          <span class="st">${STATUS_LABEL[t.status] || ''}</span>
          <span class="wired-n">${w.n === w.total ? 'ALL WORKING' : `<b>${w.n}</b>/${w.total} wired`}</span>
        </div>
        <div class="row">
          ${t.href ? `<button class="open" data-href="${esc(t.href)}">Open →</button>` : '<span></span>'}
          <button class="open" data-expand="1">Inside →</button>
        </div>
      </div>
      <span class="port in" data-port="in"></span>
      <span class="port out" data-port="out"></span>`;
  }
  canvas.appendChild(el);
  wireNodeEvents(el, n);
}

/* Pick a real folder on this device (desktop Chrome/Edge). Elsewhere, name the spot. */
async function setFolder(n, el) {
  if (window.showDirectoryPicker) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      n.label = handle.name;
      try { await idbSet('artFolder', handle); } catch {}
      save(); renderAll();
      toast(`Folder set: ${handle.name} — gang sheet exports will save there`);
    } catch { /* user cancelled */ }
  } else {
    const label = (prompt('Name the save spot (e.g. Downloads, iCloud/Art):', n.label || 'Downloads') || '').trim();
    if (!label) return;
    n.label = label; save(); renderAll();
    toast('On this device, exports go to your Downloads — label saved');
  }
}

function renderAll() {
  canvas.querySelectorAll('.node').forEach(e => e.remove());
  state.nodes.forEach(renderNode);
  drawWires();
}

/* ---- Tidy ----
 *
 * Drag enough blocks around and the line stops reading as a line. This puts
 * every block back where the wiring says it belongs: a step sits one column to
 * the right of whatever feeds it, and blocks sharing a column stack down the
 * screen in order. Press it and the whole thing snaps into shape.
 *
 * The column comes from the wires, not from where a block happens to be
 * sitting, so tidying twice gives the same answer and a block you dragged
 * somewhere odd goes back to where its wiring says it lives. Anything with
 * nothing feeding it starts at the left, which is what makes the line read
 * start-to-finish.
 *
 * A loop in the wiring can't push a column forever — each block is settled at
 * most as many times as there are blocks, which is the point where a longer
 * path has stopped being possible.
 */
const TIDY_COL = 280;   // left-to-right step, matches the default line
const TIDY_ROW = 170;   // top-to-bottom stack
const TIDY_PAD = 60;    // margin from the canvas edge

function tidy() {
  const nodes = state.nodes;
  if (!nodes.length) return;

  const feeders = new Map(nodes.map(n => [n.id, []]));
  (state.wires || []).forEach(([from, to]) => {
    if (feeders.has(to) && feeders.has(from)) feeders.get(to).push(from);
  });

  // One column right of the furthest thing feeding it.
  const col = new Map(nodes.map(n => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const n of nodes) {
      const ins = feeders.get(n.id);
      if (!ins.length) continue;
      const want = Math.max(...ins.map(id => col.get(id))) + 1;
      if (want > col.get(n.id)) { col.set(n.id, want); moved = true; }
    }
    if (!moved) break;
  }

  // Stack each column, keeping the order they're already in so a tidy never
  // shuffles two blocks past each other for no reason.
  const rows = new Map();
  for (const n of nodes) {
    const c = col.get(n.id);
    const row = rows.get(c) || 0;
    n.x = TIDY_PAD + c * TIDY_COL;
    n.y = TIDY_PAD + row * TIDY_ROW;
    rows.set(c, row + 1);
  }

  save();
  renderAll();
  fitLine();
  const wide = Math.max(...[...rows.keys()]) + 1;
  toast(`Stacked — ${nodes.length} blocks, ${wide} step${wide === 1 ? '' : 's'} across`);
}

/* port center, in canvas coordinates */
function portXY(id, side) {
  const el = nodeEl(id); if (!el) return null;
  const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
  return side === 'out' ? { x: x + w, y: y + h / 2 } : { x, y: y + h / 2 };
}

function drawWires() {
  let html = '';
  state.wires.forEach(([a, b], i) => {
    const p1 = portXY(a, 'out'), p2 = portXY(b, 'in');
    if (!p1 || !p2) return;
    const dx = Math.max(46, Math.abs(p2.x - p1.x) * 0.45);
    const d = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
    html += `<path d="${d}" fill="none" stroke="rgba(196,241,53,0.10)" stroke-width="14" data-w="${i}"></path>`;
    html += `<path d="${d}" fill="none" stroke="#c4f135" stroke-width="2" opacity="0.75" style="pointer-events:none"></path>`;
    html += `<circle cx="${p2.x}" cy="${p2.y}" r="3.5" fill="#c4f135" opacity="0.9"></circle>`;
  });
  svg.innerHTML = html;
  svg.querySelectorAll('path[data-w]').forEach(p => {
    p.addEventListener('click', () => {
      state.wires.splice(Number(p.dataset.w), 1);
      save(); drawWires(); toast('Wire cut');
    });
  });
}

/* ---- node events: drag, remove, open, ports ---- */
function wireNodeEvents(el, n) {
  let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, pid = null;

  // Grab the block anywhere — not just its title bar. Controls still work.
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.rm, .open, .port, .exp')) return;
    e.preventDefault();
    pid = e.pointerId; el.setPointerCapture(pid);
    sx = e.clientX; sy = e.clientY; ox = n.x; oy = n.y; moved = false;
    el.classList.add('dragging');
  });
  el.addEventListener('pointermove', (e) => {
    if (pid === null || e.pointerId !== pid) return;
    const dx = (e.clientX - sx) / zoom, dy = (e.clientY - sy) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    // Free placement: only stop at the top/left edge, and the board grows to meet you.
    n.x = Math.max(0, ox + dx);
    n.y = Math.max(0, oy + dy);
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    growCanvas(n.x + el.offsetWidth, n.y + el.offsetHeight);
    drawWires();
  });
  const endDrag = (e) => {
    if (pid === null || (e && e.pointerId !== pid)) return;
    pid = null; el.classList.remove('dragging');
    if (moved) save();
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  el.querySelector('.rm').addEventListener('click', () => {
    if (!confirm('Remove this step from the line?')) return;
    state.nodes = state.nodes.filter(x => x.id !== n.id);
    state.wires = state.wires.filter(([a, b]) => a !== n.id && b !== n.id);
    save(); renderAll(); toast('Step removed');
  });

  el.querySelectorAll('.open').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.setfolder) { setFolder(n, el); return; }
    if (btn.dataset.expand) { openDetail(n); return; }
    const href = btn.dataset.href;
    if (!href) return;
    if (/^https?:/.test(href)) window.open(href, '_blank', 'noopener');
    else location.href = href;
  }));
  const exp = el.querySelector('.exp');
  if (exp) exp.addEventListener('click', () => openDetail(n));

  // double-click / double-tap a block to open it up
  el.addEventListener('dblclick', (e) => {
    if (e.target.closest('.rm, .port')) return;
    openDetail(n);
  });
  let lastTap = 0;
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.target.closest('.rm, .port, .open, .exp')) return;
    const now = performance.now();
    if (now - lastTap < 320 && !moved) { openDetail(n); lastTap = 0; return; }
    lastTap = now;
  });

  el.querySelector('.port.out').addEventListener('click', (e) => {
    e.stopPropagation();
    canvas.querySelectorAll('.port.armed').forEach(p => p.classList.remove('armed'));
    if (armedOut === n.id) { armedOut = null; return; }
    armedOut = n.id;
    e.currentTarget.classList.add('armed');
    toast('Now tap a left port to connect');
  });
  el.querySelector('.port.in').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!armedOut || armedOut === n.id) return;
    if (!state.wires.some(([a, b]) => a === armedOut && b === n.id)) {
      state.wires.push([armedOut, n.id]); save();
    }
    armedOut = null;
    canvas.querySelectorAll('.port.armed').forEach(p => p.classList.remove('armed'));
    drawWires(); toast('Connected');
  });
}

canvas.addEventListener('click', (e) => {
  if (e.target === canvas && armedOut) {
    armedOut = null;
    canvas.querySelectorAll('.port.armed').forEach(p => p.classList.remove('armed'));
  }
});

/* ---- tray ---- */
/* The steps, in the order a job actually happens, rather than the order they
   were written. Twenty-two buttons in a row is a thing you scroll past; five
   short groups is a thing you read. Anything not named here still shows up,
   under Other — the list can never quietly lose a tool. */
const STEP_GROUPS = [
  ['Art comes in',    ['locker', 'vault', 'aiimage', 'logomaker']],
  ['Make the thing',  ['shirts', 'gangsheet', 'sticker', 'blanks', 'aivideo']],
  ['Sell it',         ['deploy', 'shopify', 'tiktok', 'wholesale']],
  ['Print and ship',  ['ticket', 'press', 'manifest', 'tracking']],
  ['Around the edge', ['omniflow', 'live', 'drive', 'folder', 'fusion', 'custom']],
];

/* Put a step on the board, wherever you're currently looking. */
function addStep(type) {
  const t = TOOLS[type];
  if (!t) return;
  let label = null;
  if (type === 'custom') {
    label = (prompt('Name this step:') || '').trim();
    if (!label) return;
  }
  const node = { id: 'n' + Date.now(), type, label,
    x: Math.round(viewport.scrollLeft / zoom) + 50,
    y: Math.round(viewport.scrollTop / zoom) + 110 };
  state.nodes.push(node); save();
  renderNode(node); growToFitAll(); drawWires();
  toast((label || t.name) + ' added — drag it into the line');
}

/* The picker. One tap shows what a step does, a second adds it — a phone has
   no hover, so the preview has to be something you ask for. */
function buildStepPicker() {
  const listed = new Set(STEP_GROUPS.flatMap(([, ids]) => ids));
  const groups = STEP_GROUPS.concat(
    [['Other', Object.keys(TOOLS).filter(id => !listed.has(id))]]
  ).filter(([, ids]) => ids.length);

  let picked = null;

  $('stepList').innerHTML = groups.map(([title, ids]) => `
    <div style="font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
                color:var(--iron-2);margin:10px 2px 6px;">${esc(title)}</div>
    ${ids.map(id => {
      const t = TOOLS[id];
      const dot = { live: '#c4f135', key: '#ff7a2f', gated: '#5b8dd6', manual: '#8a8378' }[t.status] || '#8a8378';
      return `<button class="opt" type="button" data-step="${id}">
        <span class="d" style="background:${dot};color:${dot};"></span>
        <span>${esc(t.name)}<small>${esc(STATUS_LABEL[t.status] || t.status)}</small></span>
      </button>`;
    }).join('')}`).join('');

  $('stepList').querySelectorAll('[data-step]').forEach(b => {
    b.addEventListener('click', () => {
      picked = b.dataset.step;
      const t = TOOLS[picked];
      $('stepList').querySelectorAll('.opt').forEach(o => o.classList.remove('sel'));
      b.classList.add('sel');
      $('prevName').textContent = t.name;
      const caps = (CAPS[picked] || []).map(c => c[0]);
      $('prevDesc').innerHTML = esc(t.desc)
        + (caps.length ? `<br><span style="color:var(--bone-dim);">Does: ${esc(caps.join(' · '))}</span>` : '')
        + `<br><span style="color:var(--bone-dim);">${esc(STATUS_LABEL[t.status] || '')}${t.href ? '' : ' — no page yet'}</span>`;
      $('stepAdd').disabled = false;
    });
  });

  $('stepAdd').addEventListener('click', () => {
    if (!picked) return;
    addStep(picked);
    $('stepPick').classList.remove('open');
  });
  $('stepClose').addEventListener('click', () => $('stepPick').classList.remove('open'));
  $('stepPick').addEventListener('click', (e) => {
    if (e.target === $('stepPick')) $('stepPick').classList.remove('open');
  });
  $('addStepBtn').addEventListener('click', () => $('stepPick').classList.add('open'));
}


/* ---- reset ----
   Reset only puts the blocks back; the wiring, prompts and rates you set are
   work, and work isn't what "reset the layout" should throw away. */
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Start fresh with one block?\n\nYour wiring, prompts and rates are kept, and the full line is still in Setups.')) return;
  const keep = { links: state.links, notes: state.notes, prompts: state.prompts, costs: state.costs };
  state = defaultState();
  Object.assign(state, keep);
  save(); renderAll(); toast('Fresh board — add your next step');
});

/* ---- saved setups ----
   Once a line is arranged the way somebody likes it, they should be able to
   keep it and come back to it. Setups live on this device, alongside the
   board itself. */
const SETUPS_KEY = 'skrewu_board_setups';

function loadSetups() {
  try { return JSON.parse(localStorage.getItem(SETUPS_KEY)) || []; } catch { return []; }
}
function writeSetups(list) {
  try { localStorage.setItem(SETUPS_KEY, JSON.stringify(list)); return true; }
  catch { toast("This browser won't save setups"); return false; }
}

function renderSetups() {
  const list = loadSetups();
  const el = $('setupList');

  /* The example line always sits at the top, above anything saved. It can be
     loaded but not deleted — it's a starting point, not one of your setups. */
  const example = `
    <div class="li" style="display:flex;align-items:center;gap:10px;">
      <span style="flex:1;">
        <b>The full line</b>
        <span style="display:block;font-size:10px;color:var(--iron-2);letter-spacing:.08em;">
          example · 13 steps · 14 hand-offs</span>
      </span>
      <button class="tbtn" id="loadExample" type="button">Load</button>
    </div>`;

  const wireExample = () => {
    const b = $('loadExample');
    if (!b) return;
    b.addEventListener('click', () => {
      const s = fullLine();
      state.nodes = s.nodes.map(n => ({ ...n }));
      state.wires = s.wires.map(w => [...w]);
      save(); renderAll(); growToFitAll(); fitLine();
      $('setups').classList.remove('open');
      toast('Loaded the full line — press Tidy to stack it');
    });
  };

  if (!list.length) {
    el.innerHTML = example + `<div style="color:var(--iron-2);font-size:12px;padding:12px 2px;">
      Nothing saved yet. Arrange the board how you like it, name it below, and save.</div>`;
    wireExample();
    return;
  }
  el.innerHTML = example + list.map((s, i) => `
    <div class="li" style="display:flex;align-items:center;gap:10px;">
      <span style="flex:1;">
        <b>${esc(s.name)}</b>
        <span style="display:block;font-size:10px;color:var(--iron-2);letter-spacing:.08em;">
          ${(s.nodes || []).length} steps · ${(s.wires || []).length} hand-offs</span>
      </span>
      <button class="tbtn" data-load="${i}" type="button">Load</button>
      <button class="tbtn" data-drop="${i}" type="button" title="Delete this setup">&times;</button>
    </div>`).join('');

  wireExample();

  el.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
    const s = loadSetups()[Number(b.dataset.load)];
    if (!s) return;
    // Their wiring and rates carry across — a setup is an arrangement, not a wipe.
    state.nodes = (s.nodes || []).map(n => ({ ...n }));
    state.wires = (s.wires || []).map(w => [...w]);
    save(); renderAll(); growToFitAll(); fitLine();
    $('setups').classList.remove('open');
    toast(`Loaded “${s.name}”`);
  }));

  el.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => {
    const list2 = loadSetups();
    const s = list2[Number(b.dataset.drop)];
    if (!s || !confirm(`Delete the setup “${s.name}”?`)) return;
    list2.splice(Number(b.dataset.drop), 1);
    writeSetups(list2); renderSetups();
  }));
}

$('setupsBtn').addEventListener('click', () => {
  renderSetups();
  $('setupName').value = '';
  $('setups').classList.add('open');
});
$('setupClose').addEventListener('click', () => $('setups').classList.remove('open'));
$('setups').addEventListener('click', (e) => {
  if (e.target === $('setups')) $('setups').classList.remove('open');
});

$('setupSave').addEventListener('click', () => {
  const name = ($('setupName').value || '').trim();
  if (!name) { toast('Give it a name first'); return; }
  const list = loadSetups();
  const entry = {
    name,
    nodes: state.nodes.map(n => ({ ...n })),
    wires: state.wires.map(w => [...w]),
  };
  const at = list.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  if (at >= 0) {
    if (!confirm(`Replace the setup “${list[at].name}”?`)) return;
    list[at] = entry;
  } else {
    list.push(entry);
  }
  if (writeSetups(list)) { renderSetups(); $('setupName').value = ''; toast(`Saved “${name}”`); }
});

/* =================================================================
   NODE DETAIL — open a tool and see its buttons fanned out around it,
   each one wireable to the service (API) that actually runs it.
   ================================================================= */
const sheet = $('sheet'), stage = $('stage'), spokes = $('spokes');
let detailNode = null, pickIndex = -1;

/* Plain hex, not CSS variables — var() isn't reliable inside SVG stroke
   attributes on Safari, which is where these wires actually get looked at. */
const DIM = '#4b453d';
function serviceDot(id) {
  const s = SERVICES[id];
  if (!s) return DIM;
  return { live: '#c4f135', key: '#ff8a3d', gated: '#d8402f', manual: '#7f95b0' }[s.status] || DIM;
}

/* A colour on its own doesn't tell you anything — orange next to the words
   GOOGLE DRIVE reads as "broken" when what it means is "chosen, but nobody has
   connected the account yet". So every connection says its state in words, and
   the colour is only there to let you find the unfinished ones at a glance. */
const STATE_WORD = {
  live:   'working',
  key:    'needs key',
  gated:  'needs approval',
  manual: 'you do this',
};
function stateWord(id) {
  const s = SERVICES[id];
  if (!s) return 'not set';
  return STATE_WORD[s.status] || 'not set';
}

function openDetail(n) {
  detailNode = n;
  const t = TOOLS[n.type] || TOOLS.custom;
  $('sheetTitle').innerHTML = `Inside <b>${esc(n.label || t.name)}</b>`;
  sheet.classList.add('open');
  drawDetail();
}
function closeDetail() { sheet.classList.remove('open'); detailNode = null; renderAll(); }

/* ---------- LIVE VIEW: the real tool, wired off its own buttons ---------- */
let liveBtns = [];   // {key, label, px, py}  (positions inside the tool panel)
let ringWrap = null;                 // the tool panel, when one is open
let toolZoom = 1;                    // how big the tool itself is drawn
let placeMarkers = null;             // re-lays the glowing markers
function setToolZoom(z) {
  toolZoom = Math.max(0.5, Math.min(3, z));
  if (placeMarkers) placeMarkers();
}

function labelOf(el) {
  const pick = el.querySelector('.qc-t,.t-name,.pc-t');
  const txt = (pick ? pick.textContent : el.textContent) || '';
  return txt.trim().replace(/\s+/g, ' ').slice(0, 34);
}

function drawLive(n, t) {
  const W = stage.clientWidth, H = stage.clientHeight;

  const live = document.createElement('div');
  live.className = 'live full';
  stage.appendChild(live);

  const inner = document.createElement('div');
  inner.className = 'inner';
  live.appendChild(inner);

  const panelW = live.clientWidth, panelH = live.clientHeight;
  const FRAME_W = 520;                       // the tool's own layout width
  const FRAME_H = Math.max(940, Math.round(panelH / (panelW / FRAME_W)));
  const base = panelW / FRAME_W;

  const frame = document.createElement('iframe');
  frame.setAttribute('scrolling', 'no');
  frame.setAttribute('tabindex', '-1');
  frame.style.width = FRAME_W + 'px';
  frame.style.height = FRAME_H + 'px';
  frame.src = t.href;
  inner.appendChild(frame);

  const cap = document.createElement('div');
  cap.className = 'lbl'; cap.textContent = 'live · ' + (n.label || t.name);
  live.appendChild(cap);

  ringWrap = live;   // the zoom buttons act on the tool itself now

  frame.addEventListener('load', () => {
    let doc;
    try { doc = frame.contentDocument; } catch { doc = null; }
    if (!doc) { live.remove(); drawRadial(n, t); return; }

    const full = Math.max(frame.clientHeight, doc.body.scrollHeight || 0);
    if (full > frame.clientHeight) frame.style.height = full + 'px';

    // this node's own part of the page
    let roots = [doc];
    if (t.scope) {
      const found = [];
      doc.querySelectorAll(t.scope).forEach(el => {
        const sec = el.closest('section') || el;
        if (!found.includes(sec)) found.push(sec);
      });
      if (found.length) roots = found;
    }
    const sel = '[data-group][data-id], button[id], button[class], a[data-tab]';
    const els = roots.flatMap(r => [...r.querySelectorAll(sel)]);

    const seen = new Set();
    liveBtns = [];
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const label = labelOf(el);
      if (!label || (label.match(/[A-Za-z0-9]/g) || []).length < 2) return;
      const key = (el.dataset.id || el.id || label).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      liveBtns.push({ key, label, rx: r.left + r.width / 2, ry: r.top + r.height / 2 });
    });

    if (!liveBtns.length) { live.remove(); drawRadial(n, t); return; }

    // a glowing marker on each real button — orange until it works, then green
    liveBtns.forEach(b => {
      const mk = document.createElement('button');
      mk.type = 'button'; mk.className = 'mk';
      mk.title = b.label;
      mk.setAttribute('aria-label', b.label);
      mk.addEventListener('click', (e) => { e.stopPropagation(); openPicker(b.key, b.label, true); });
      inner.appendChild(mk);
      b.mk = mk;
    });

    function place() {
      const scale = base * toolZoom;
      frame.style.transform = `scale(${scale})`;
      frame.style.transformOrigin = '0 0';
      inner.style.width = Math.round(FRAME_W * scale) + 'px';
      inner.style.height = Math.round(parseFloat(frame.style.height) * scale) + 'px';
      let okCount = 0;
      liveBtns.forEach(b => {
        b.mk.style.left = (b.rx * scale) + 'px';
        b.mk.style.top = (b.ry * scale) + 'px';
        const svc = SERVICES[state.links[n.type + '#' + b.key]];
        const ok = svc && svc.status === 'live';
        b.mk.classList.toggle('ok', !!ok);
        if (ok) okCount++;
      });
      $('sheetCount').textContent = `${okCount}/${liveBtns.length}`;
      if ($('costs').classList.contains('open')) renderCosts();
    }
    placeMarkers = place;
    place();

    // open on this node's own section
    if (t.scope && roots[0] !== doc) {
      const topY = Math.min(...roots.map(s => s.getBoundingClientRect().top));
      live.scrollTop = Math.max(0, topY * base * toolZoom - 10);
    }
  });
}

/* Two ways to look inside a node:
   'live' — the real tool, with a glowing marker on each of its own buttons
   'map'  — the wiring map: the tool in the middle, every connection fanned out
            around it with what runs it, the prompt and the cost.
   Tools without a page of their own only have the map. */
let detailView = 'live';

function drawDetail() {
  if (!detailNode) return;
  const n = detailNode, t = TOOLS[n.type] || TOOLS.custom;
  stage.querySelectorAll('.hubn,.cap,.live,.chips,.chipr,.dotb,.ringwrap,.legend').forEach(e => e.remove());
  spokes.innerHTML = '';
  liveBtns = []; ringWrap = null; placeMarkers = null; toolZoom = 1;

  const hasPage = !!(t.href && !/^https?:/.test(t.href));
  const btn = $('viewBtn');
  btn.style.display = hasPage ? '' : 'none';
  btn.textContent = detailView === 'live' ? 'Map' : 'Tool';

  if (hasPage && detailView === 'live') {
    $('sheetFoot').textContent = 'Tap a glowing marker to wire that button';
    drawLive(n, t);
    return;
  }
  $('sheetFoot').textContent = 'Every connection this tool makes — tap one to set it up';
  drawRadial(n, t);
}

function drawRadial(n, t) {
  const caps = capsOf(n.type);
  const W = stage.clientWidth, H = stage.clientHeight;
  const cx = W / 2, cy = H / 2;
  const narrow = W < 620;
  // Ring wide enough that a button never sits on top of the hub, and never
  // runs off the edge of the screen.
  const capW = narrow ? 112 : 132;
  const hubHalf = narrow ? 63 : 95;
  const rx = Math.max(hubHalf + capW / 2 + 10, W / 2 - capW / 2 - 14);
  // Leaves the bottom strip clear for the key, and stops a three-spoke map
  // from stranding one card at the top of a tall phone with nothing between.
  const ry = Math.max(88, Math.min(H * 0.34, H / 2 - 84));

  stage.querySelectorAll('.hubn,.cap,.live,.chips,.chipr,.dotb,.ringwrap,.legend').forEach(e => e.remove());

  /* Spokes start at the top and go round, so a map with three of them reaches
     a full radius up but only half of one down — geometrically centred, and
     visibly sitting high with a hole underneath. Centre what's actually drawn
     instead of the circle it came from. */
  const ys = caps.map((c, i) => Math.sin((-Math.PI / 2) + (i / caps.length) * Math.PI * 2) * ry);
  const cy2 = cy - (Math.min(...ys) + Math.max(...ys)) / 2;

  const hub = document.createElement('div');
  hub.className = 'hubn';
  hub.style.left = cx + 'px'; hub.style.top = cy2 + 'px';
  const w = wiredCount(n.type);
  const allGreen = w.n === w.total;
  if (!allGreen) hub.style.borderColor = 'var(--ember)';
  hub.innerHTML = `<div class="t">${esc(n.label || t.name)}</div>` +
    `<div class="s" style="color:${allGreen ? 'var(--acid)' : 'var(--bone-dim)'}">${allGreen ? 'all working' : w.n + '/' + w.total + ' wired'}</div>`;
  stage.appendChild(hub);

  /* A ring around the hub, filled as far as the connections that actually
     work. Same number as the caption underneath, readable without reading. */
  const ringR = hubHalf + 16;
  const circ = 2 * Math.PI * ringR;
  let paths =
    `<circle cx="${cx}" cy="${cy2}" r="${ringR}" fill="none" stroke="var(--iron)" stroke-width="2"></circle>` +
    (w.n ? `<circle cx="${cx}" cy="${cy2}" r="${ringR}" fill="none" stroke="var(--acid)" stroke-width="3"
             stroke-linecap="round" stroke-dasharray="${(circ * w.n / w.total).toFixed(1)} ${circ.toFixed(1)}"
             transform="rotate(-90 ${cx} ${cy2})"></circle>` : '');

  caps.forEach((c, i) => {
    const a = (-Math.PI / 2) + (i / caps.length) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy2 + Math.sin(a) * ry;
    const sid = linkOf(n.type, i);
    const svc = SERVICES[sid];
    const col = serviceDot(sid);

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cap' + (svc && svc.status === 'live' ? ' on' : '');
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.borderColor = col;
    const note = state.notes[n.type + ':' + i];
    const pr = state.prompts[n.type + ':' + i];
    const cst = Number(state.costs[n.type + ':' + i]) || 0;
    el.innerHTML = `<div class="cn">${esc(c[0])}</div>` +
      `<div class="cs"><i class="pip" style="background:${col}"></i>` +
        `<span style="color:${col}">${esc(svc ? svc.name : 'nothing yet')}</span></div>` +
      `<div class="cst">${esc(stateWord(sid))}${cst ? ' · ' + money(cst) : ''}</div>` +
      (pr ? `<div class="ci">“${esc(pr)}”</div>` : '') +
      (note ? `<div class="ci">${esc(note)}</div>` : '');
    el.addEventListener('click', () => openPicker(i, c[0]));
    stage.appendChild(el);

    const working = svc && svc.status === 'live';
    paths += `<path d="M ${cx} ${cy2} L ${x} ${y}" stroke="${col}" fill="none"
               stroke-width="${working ? 2.4 : 1.4}" opacity="${working ? 1 : 0.6}"
               ${sid ? '' : 'stroke-dasharray="5 5"'}></path>`;
    paths += `<circle cx="${x}" cy="${y}" r="${working ? 5 : 3.5}" fill="${col}"></circle>`;
  });
  spokes.innerHTML = paths;

  /* Only the states actually on this map, so it stays short and stays true. */
  const ORDER = ['live', 'key', 'gated', 'manual', 'none'];
  const here = [];
  caps.forEach((c, i) => {
    const s = SERVICES[linkOf(n.type, i)];
    const st = s ? s.status : 'none';
    if (!here.includes(st)) here.push(st);
  });
  here.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  if (here.length > 1) {
    const key = document.createElement('div');
    key.className = 'legend';
    key.innerHTML = here.map(st => {
      const col = { live: '#c4f135', key: '#ff8a3d', gated: '#d8402f', manual: '#7f95b0' }[st] || DIM;
      const word = STATE_WORD[st] || 'not set';
      return `<span><i class="pip" style="background:${col}"></i>${esc(word)}</span>`;
    }).join('');
    stage.appendChild(key);
  }

  $('sheetCount').textContent = `${w.n}/${w.total}`;
}

let pickChoice = null, pickKey = '';
function openPicker(i, capName, isLive) {
  pickIndex = i;
  const key = isLive ? (detailNode.type + '#' + i) : (detailNode.type + ':' + i);
  pickKey = key;
  pickChoice = isLive ? (state.links[key] || null) : linkOf(detailNode.type, i);
  $('pickName').textContent = capName;
  $('pickNote').value = state.notes[key] || '';
  $('pickPrompt').value = state.prompts[key] || '';
  $('pickCost').value = state.costs[key] != null ? state.costs[key] : '';
  renderPickList();
  $('pick').classList.add('open');
}
function renderPickList() {
  const list = $('pickList');
  list.innerHTML = Object.entries(SERVICES).map(([id, s]) => `
    <button class="opt${id === pickChoice ? ' sel' : ''}" data-s="${id}" type="button">
      <span class="d" style="color:${serviceDot(id)};background:${serviceDot(id)}"></span>
      <span>${esc(s.name)}${id === pickChoice ? ' ✓' : ''}<small>${esc(s.note)}</small></span>
    </button>`).join('') +
    `<button class="opt clear${pickChoice === null ? ' sel' : ''}" data-s="" type="button"><span>Not wired yet</span></button>`;
  list.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
    pickChoice = b.dataset.s || null;
    renderPickList();
  }));
}
function savePick() {
  const key = pickKey;
  state.links[key] = pickChoice;
  const note = $('pickNote').value.trim();
  if (note) state.notes[key] = note; else delete state.notes[key];
  const prompt = $('pickPrompt').value.trim();
  if (prompt) state.prompts[key] = prompt; else delete state.prompts[key];
  const cost = $('pickCost').value.trim();
  if (cost !== '' && !isNaN(cost)) state.costs[key] = Number(cost); else delete state.costs[key];
  save(); $('pick').classList.remove('open'); drawDetail();
  if ($('costs').classList.contains('open')) setTimeout(renderCosts, 400);
  toast(pickChoice ? `Wired to ${SERVICES[pickChoice].name}` : 'Connection cleared');
}

$('pickSave').addEventListener('click', savePick);
$('pickCancel').addEventListener('click', () => $('pick').classList.remove('open'));
/* what each button costs, and what a full run adds up to */
function renderCosts() {
  if (!detailNode) return;
  const n = detailNode;
  const rows = liveBtns.length
    ? liveBtns.map(b => ({ key: n.type + '#' + b.key, label: b.label }))
    : capsOf(n.type).map((c, i) => ({ key: n.type + ':' + i, label: c[0] }));
  let total = 0;
  $('costList').innerHTML = rows.map(r => {
    const c = Number(state.costs[r.key]) || 0;
    total += c;
    const sid = state.links[r.key] !== undefined ? state.links[r.key] : null;
    const svc = SERVICES[sid] || SERVICES[linkOf(n.type, 0)];
    const name = SERVICES[state.links[r.key]] ? SERVICES[state.links[r.key]].name : 'not wired';
    return `<div class="ci"><span class="nm"><b>${esc(r.label)}</b><i>${esc(name)}</i></span>
      <span class="amt${c ? '' : ' zero'}">${c ? money(c) : '—'}</span></div>`;
  }).join('') || '<div class="ci"><span class="nm">Nothing here yet</span></div>';
  $('costTotal').textContent = money(total);
}
$('costBtn').addEventListener('click', () => {
  const el = $('costs');
  el.classList.toggle('open');
  $('costBtn').classList.toggle('on', el.classList.contains('open'));
  if (el.classList.contains('open')) renderCosts();
});

$('rzIn').addEventListener('click', () => setToolZoom(toolZoom * 1.3));
$('rzOut').addEventListener('click', () => setToolZoom(toolZoom / 1.3));
$('rzFit').addEventListener('click', () => { setToolZoom(1); if (ringWrap) { ringWrap.scrollTop = 0; ringWrap.scrollLeft = 0; } });

/* the tool panel scrolls itself — nothing to drag around behind it */

$('viewBtn').addEventListener('click', () => {
  detailView = detailView === 'live' ? 'map' : 'live';
  drawDetail();
});
$('sheetBack').addEventListener('click', closeDetail);
$('pick').addEventListener('click', (e) => { if (e.target === $('pick')) $('pick').classList.remove('open'); });
window.addEventListener('resize', () => { if (detailNode) drawDetail(); });

/* ---- board lock: freeze the canvas so only blocks move ---- */
const LOCK_KEY = 'skrewu_board_locked';
let locked = false;
function applyLock(announce) {
  const btn = $('lockBtn');
  viewport.classList.toggle('locked', locked);
  // pin the page itself too, so the phone can't scroll or rubber-band
  document.documentElement.classList.toggle('board-locked', locked);
  document.body.classList.toggle('board-locked', locked);
  btn.classList.toggle('on', locked);
  btn.setAttribute('aria-pressed', locked ? 'true' : 'false');
  btn.querySelector('.ic').textContent = locked ? '🔒' : '🔓';
  btn.title = locked
    ? 'Screen locked — drag empty space to slide the board. Tap to unlock.'
    : 'Lock the screen so the phone can’t scroll while you work';
  try { localStorage.setItem(LOCK_KEY, locked ? '1' : '0'); } catch {}
  if (announce) toast(locked ? 'Screen locked — drag empty space to slide the board' : 'Unlocked — normal scrolling');
}
$('lockBtn').addEventListener('click', () => { locked = !locked; applyLock(true); });

/* Drag empty space to slide the board around. While locked this is how you
   move across the line — the phone itself never scrolls. Unlocked on a phone,
   normal swipe-scrolling handles it, so we stay out of the way. */
let panPid = null, panSX = 0, panSY = 0, panSL = 0, panST = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.node')) return;              // blocks handle themselves
  if (!locked && e.pointerType !== 'mouse') return;   // let touch scroll natively when unlocked
  panPid = e.pointerId; canvas.setPointerCapture(panPid);
  panSX = e.clientX; panSY = e.clientY;
  panSL = viewport.scrollLeft; panST = viewport.scrollTop;
  canvas.classList.add('panning');
});
canvas.addEventListener('pointermove', (e) => {
  if (panPid === null || e.pointerId !== panPid) return;
  viewport.scrollLeft = panSL - (e.clientX - panSX);
  viewport.scrollTop  = panST - (e.clientY - panSY);
});
const endPan = () => { if (panPid === null) return; panPid = null; canvas.classList.remove('panning'); };
canvas.addEventListener('pointerup', endPan);
canvas.addEventListener('pointercancel', endPan);

/* While locked, swallow page-level touch scrolling (Safari still bounces the
   window otherwise). The tool tray stays swipeable so you can still add steps. */
document.addEventListener('touchmove', (e) => {
  const inSheet = sheet.classList.contains('open');
  if (!locked && !inSheet) return;
  const t = e.target;
  // the tray, the tool panel, the cost list and the picker all still scroll
  if (t && t.closest && t.closest('.tray, .live, .costs .cl, .pick .list, .pick .info')) return;
  if (e.cancelable) e.preventDefault();
}, { passive: false });

/* ---- zoom buttons ---- */
$('zoomIn').addEventListener('click', () => setZoom(zoom + 0.15));
$('zoomOut').addEventListener('click', () => setZoom(zoom - 0.15));
$('zoomFit').addEventListener('click', fitLine);
$('tidyBtn').addEventListener('click', tidy);

/* ---- go ---- */
buildStepPicker();
renderAll();
growToFitAll();
/* Phones open zoomed to where the blocks are still readable (tap FIT for the
   whole-line overview); desktop opens 1:1. */
if (window.innerWidth < 760) { setZoom(0.7); viewport.scrollLeft = 0; viewport.scrollTop = 0; }
else applyZoom();

try { locked = localStorage.getItem(LOCK_KEY) === '1'; } catch {}
applyLock(false);

/* Came from the start screen? Show them the whole line at once and say so,
   so the first thing they see is their own setup, not an empty grid. */
if (new URLSearchParams(location.search).get('new')) {
  fitLine();
  setTimeout(() => toast('Your line is ready — drag anything, tap a block to look inside'), 350);
}

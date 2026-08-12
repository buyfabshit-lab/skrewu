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
  locker:    { name: 'Locker',          desc: 'Logos in — each person’s own vault.',      href: 'locker.html?who=rorion', status: 'live' },
  logomaker: { name: 'Logo Maker',      desc: 'Strip backgrounds → clean print PNG.',      href: 'tools-library/gang-sheet-logo-maker/index.html', status: 'live' },
  vault:     { name: 'Design Vault',    desc: 'The big archive — browse licensed art.',    href: 'tools-library/logo-vault/index.html', status: 'live' },
  shirts:    { name: 'Shirts Studio',   desc: 'Logo on a real blank — listing mockup.',    href: 'locker.html?who=rorion', status: 'live' },
  gangsheet: { name: 'Gang Sheet',      desc: 'Pack logos → 300 DPI DTF print file.',      href: 'locker.html?who=rorion', status: 'live' },
  blanks:    { name: 'Blanks Catalog',  desc: 'Pick a blank from the S&S feed.',           href: 'tools-library/blanks-storefront/index.html', status: 'key' },
  deploy:    { name: 'Deploy Panel',    desc: 'One button → push product to stores.',      href: 'deploy.html', status: 'key' },
  shopify:   { name: 'Shopify Store',   desc: 'DEATH CORPS — deathcorps.shop.',            href: 'https://deathcorps.shop', status: 'live' },
  tiktok:    { name: 'TikTok Shop',     desc: 'Waiting on Partner API keys.',              href: null, status: 'gated' },
  drive:     { name: 'Drive Backup',    desc: 'n8n auto-copies art to Google Drive.',      href: null, status: 'key' },
  omniflow:  { name: 'OmniFlow Orders', desc: 'All channels’ orders, one console.',        href: 'tools-library/omniflow-command/index.html', status: 'live' },
  wholesale: { name: 'Wholesale Form',  desc: 'B2B multi-item order drop-off.',            href: 'tools-library/wholesale-order-form/index.html', status: 'live' },
  ticket:    { name: 'Print Ticket',    desc: 'NEVER BLANK job ticket + CAD sheet.',       href: null, status: 'manual' },
  press:     { name: 'Heat Press',      desc: 'Physical step — film on shirt.',            href: null, status: 'manual' },
  manifest:  { name: 'Ship Manifest',   desc: 'Pull & pack sheet — out the door.',         href: 'order-manifest.html', status: 'live' },
  tracking:  { name: 'Cust. Tracking',  desc: 'What the buyer sees after ordering.',       href: 'order-confirmation.html', status: 'live' },
  custom:    { name: 'Custom Step',     desc: 'Your own step in the line.',                href: null, status: 'manual' },
  folder:    { name: '📁 Folder',       desc: 'Where the files land.',                     href: null, status: 'manual' },
};
const STATUS_LABEL = { live: 'Wired', key: 'Needs key', gated: 'Gated', manual: 'Hands-on' };

/* ---- default production line ---- */
function defaultState() {
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
  if (!state || !Array.isArray(state.nodes)) state = defaultState();
} catch { state = defaultState(); }

function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} }
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
    el.innerHTML = `
      <div class="head"><span class="dotst"></span><h3>${esc(name)}</h3><button class="rm" title="Remove">&times;</button></div>
      <div class="body">
        <div class="desc">${esc(t.desc)}</div>
        <div class="row">
          <span class="st">${STATUS_LABEL[t.status] || ''}</span>
          ${t.href ? `<button class="open" data-href="${esc(t.href)}">Open →</button>` : ''}
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
    if (e.target.closest('.rm, .open, .port')) return;
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

  const open = el.querySelector('.open');
  if (open) open.addEventListener('click', () => {
    if (open.dataset.setfolder) { setFolder(n, el); return; }
    const href = open.dataset.href;
    if (/^https?:/.test(href)) window.open(href, '_blank', 'noopener');
    else location.href = href;
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
function buildTray() {
  const tray = $('tray');
  Object.entries(TOOLS).forEach(([type, t]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '+ ' + t.name;
    b.addEventListener('click', () => {
      let label = null;
      if (type === 'custom') {
        label = (prompt('Name this step:') || '').trim();
        if (!label) return;
      }
      const id = 'n' + Date.now();
      // drop it where you're actually looking (zoom-aware)
      const node = { id, type, label,
        x: Math.round(viewport.scrollLeft / zoom) + 50,
        y: Math.round(viewport.scrollTop / zoom) + 110 };
      state.nodes.push(node); save();
      renderNode(node); growToFitAll(); drawWires();
      toast((label || t.name) + ' added — drag it into the line');
    });
    tray.appendChild(b);
  });
}

/* ---- reset ---- */
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset the board to the default production line?')) return;
  state = defaultState(); save(); renderAll(); toast('Line reset');
});

/* ---- board lock: freeze the canvas so only blocks move ---- */
const LOCK_KEY = 'skrewu_board_locked';
let locked = false;
function applyLock(announce) {
  const btn = $('lockBtn');
  viewport.classList.toggle('locked', locked);
  btn.classList.toggle('on', locked);
  btn.setAttribute('aria-pressed', locked ? 'true' : 'false');
  btn.querySelector('.ic').textContent = locked ? '🔒' : '🔓';
  btn.title = locked
    ? 'Board locked — it won’t slide while you move blocks. Tap to unlock.'
    : 'Lock the board so it can’t slide while you move blocks';
  try { localStorage.setItem(LOCK_KEY, locked ? '1' : '0'); } catch {}
  if (announce) toast(locked ? 'Board locked — move blocks freely' : 'Board unlocked — swipe to pan');
}
$('lockBtn').addEventListener('click', () => { locked = !locked; applyLock(true); });

/* ---- zoom buttons ---- */
$('zoomIn').addEventListener('click', () => setZoom(zoom + 0.15));
$('zoomOut').addEventListener('click', () => setZoom(zoom - 0.15));
$('zoomFit').addEventListener('click', fitLine);

/* ---- go ---- */
buildTray();
renderAll();
growToFitAll();
/* Phones open zoomed to where the blocks are still readable (tap FIT for the
   whole-line overview); desktop opens 1:1. */
if (window.innerWidth < 760) { setZoom(0.7); viewport.scrollLeft = 0; viewport.scrollTop = 0; }
else applyZoom();

try { locked = localStorage.getItem(LOCK_KEY) === '1'; } catch {}
applyLock(false);

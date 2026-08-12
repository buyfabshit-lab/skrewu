/* ============================================================
   OmniFlow Command — unified multi-channel order intake console
   Portable tool module. Reads/updates a Supabase orders table.

   Configuration is external: config.json (same folder) or a URL passed
   as ?config=<url>. Anything not supplied there falls back to DEFAULT_CONFIG
   below, so the tool still runs when opened directly from disk.
   See README.md for the full config schema and API surface.
   ============================================================ */

/* ── Default config (overridden by config.json / ?config=) ── */
const DEFAULT_CONFIG = {
  branding: {
    businessName: 'OmniFlow',
    productName: 'OmniFlow Command',
    tagline: 'Live feed · auto-unified',
    logoUrl: null,
    colors: { accent: '#3b82f6', accent2: '#2563eb', positive: '#22c55e' },
  },
  backend: {
    supabaseUrl: 'https://qmztuagvxopahowexrum.supabase.co',
    supabaseAnonKey: 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh',
    table: 'omniflow_orders',
  },
  channels: ['shopify', 'amazon', 'ebay', 'direct_api', 'manual'],
  classifications: ['B2B Wholesale', 'DTC Standard', 'Expedited', 'Requires Review'],
};

/* Known channel presentation metadata (config.channels picks which are active). */
const CHANNEL_META = {
  shopify:    { label: 'Shopify',    color: '#95bf47', bg: '#16250f' },
  amazon:     { label: 'Amazon',     color: '#ff9900', bg: '#2a2008' },
  ebay:       { label: 'eBay',       color: '#e53238', bg: '#2a1113' },
  direct_api: { label: 'Direct API', color: '#38bdf8', bg: '#0d2233' },
  manual:     { label: 'Manual',     color: '#94a3b8', bg: '#1a2439' },
};

/* Runtime, populated by boot() once config resolves. */
let CONFIG = DEFAULT_CONFIG;
let sb = null;
let TABLE = DEFAULT_CONFIG.backend.table;
let CLASSIFICATIONS = DEFAULT_CONFIG.classifications;
let CHANNELS = DEFAULT_CONFIG.channels;

async function loadConfig() {
  const params = new URLSearchParams(location.search);
  const url = params.get('config') || 'config.json';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('config ' + res.status);
    const raw = await res.json();
    return mergeConfig(DEFAULT_CONFIG, raw);
  } catch (e) {
    console.info('[OmniFlow] using built-in default config (' + e.message + ')');
    return DEFAULT_CONFIG;
  }
}
function mergeConfig(base, over) {
  return {
    branding: { ...base.branding, ...(over.branding || {}),
      colors: { ...base.branding.colors, ...((over.branding || {}).colors || {}) } },
    backend: { ...base.backend, ...(over.backend || {}) },
    channels: Array.isArray(over.channels) && over.channels.length ? over.channels : base.channels,
    classifications: Array.isArray(over.classifications) && over.classifications.length ? over.classifications : base.classifications,
  };
}
function applyBranding(cfg) {
  const b = cfg.branding;
  document.title = b.productName + ' — Order Intake';
  const nameEl = document.getElementById('brandName');
  if (nameEl) nameEl.textContent = b.productName;
  const tagEl = document.getElementById('brandTagline');
  if (tagEl) tagEl.textContent = b.tagline;
  const logoEl = document.getElementById('brandLogo');
  if (logoEl && b.logoUrl) {
    logoEl.innerHTML = `<img src="${b.logoUrl}" alt="${escapeHtml(b.businessName)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
  }
  const c = b.colors || {};
  const root = document.documentElement.style;
  if (c.accent)   { root.setProperty('--blue', c.accent);  root.setProperty('--cyan', c.accent); }
  if (c.accent2)  { root.setProperty('--blue-2', c.accent2); }
  if (c.positive) { root.setProperty('--green', c.positive); }
}

function sourceBadge(src) {
  const m = CHANNEL_META[src] || CHANNEL_META.manual;
  let glyph;
  switch (src) {
    case 'shopify':    glyph = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.3 4.2c-.1 0-1.6.4-1.6.4s-1-1-1.1-1.1c-.1-.1-.3-.1-.4-.1 0 0-.2 0-.5.1-.4-1.1-1-1.6-1.9-1.6-.7 0-1.3.5-1.7 1.2-.9.3-1.5.5-1.6.5-.5.2-.5.2-.6.6C4.3 5.4 3 15.6 3 15.6l8.4 1.6 4.6-1.1S15.4 4.2 15.3 4.2zM11.6 3.6l-.9.3c0-.5-.1-1.1-.3-1.5.6.1.9.8 1.2 1.2zm-1.5-1c.2.4.3 1 .3 1.5l-1.6.5c.3-1.1.9-1.7 1.3-2z"/></svg>'; break;
    case 'amazon':     glyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 16c4 3 12 3 16 0"/><path d="M18 15.5c.6 1 .4 2-.2 2.6"/><path d="M6 6.5C6 5 7.6 4 9.5 4S13 5 13 6.4c0 2.6-3.5 2.2-3.5 4.6v.5"/></svg>'; break;
    case 'ebay':       glyph = 'e'; break;
    case 'direct_api': glyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l4 4-4 4"/><path d="M13 16h4"/></svg>'; break;
    default:           glyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  }
  return `<span class="src"><span class="badge" style="background:${m.bg};color:${m.color};border-color:${m.color}33">${glyph}</span><span class="nm">${m.label}</span></span>`;
}

/* ── Columns (key, label, sortable) ── */
const COLUMNS = [
  { key: 'status',            label: 'Status',            sort: true },
  { key: 'source',            label: 'Source',            sort: true },
  { key: 'intake_at',         label: 'Intake Time/Date',  sort: true },
  { key: 'platform_order_no', label: 'Platform Order #',  sort: false },
  { key: 'uct',               label: 'Unified Control #', sort: true },
  { key: 'customer_name',     label: 'Customer Info',     sort: false },
  { key: 'skus',              label: 'Items/Qty',         sort: true },
  { key: 'total_value',       label: 'Total Value',       sort: true },
  { key: 'classification',    label: 'Classification',    sort: true },
  { key: 'action',            label: 'Action',            sort: false },
];

/* ── State ── */
let ORDERS = [];
let selectedId = null;
let panelDraft = null; // { tags:[], notes:'', classification:'' } for the open order
const filters = {
  search: '',
  dateRange: 'today',
  platforms: new Set(), // populated from config.channels at boot
  status: 'all',
};
let sort = { key: 'intake_at', dir: 'desc' };

/* ── DOM ── */
const $ = id => document.getElementById(id);
const feedBody = $('feedBody');
const theadRow = $('theadRow');
const panel = $('panel');
const panelBody = $('panelBody');
const panelActions = $('panelActions');

/* ── Formatting ── */
function fmtTime(iso) {
  const d = new Date(iso);
  const t = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { t, md };
}
const fmtMoney = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Fetch ── */
async function loadOrders() {
  $('feedSub').textContent = 'Syncing unified intake…';
  const { data, error } = await sb.from(TABLE).select('*').order('intake_at', { ascending: false });
  if (error) {
    console.error(error);
    $('feedSub').textContent = 'Feed error — check connection.';
    feedBody.innerHTML = `<tr><td colspan="${COLUMNS.length}"><div class="empty">Could not reach the order feed.</div></td></tr>`;
    return;
  }
  ORDERS = data || [];
  render();
}

/* ── Filtering + sorting ── */
function withinDate(iso) {
  if (filters.dateRange === 'all') return true;
  const now = Date.now();
  const t = new Date(iso).getTime();
  if (filters.dateRange === 'today') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return t >= start.getTime();
  }
  if (filters.dateRange === '24h') return t >= now - 864e5;
  if (filters.dateRange === '7d')  return t >= now - 7 * 864e5;
  return true;
}
function visibleOrders() {
  const q = filters.search.trim().toLowerCase();
  let rows = ORDERS.filter(o => {
    if (!filters.platforms.has(o.source)) return false;
    if (filters.status !== 'all' && o.status !== filters.status) return false;
    if (!withinDate(o.intake_at)) return false;
    if (q) {
      const hay = [o.uct, o.platform_order_no, o.customer_name, o.customer_location, o.customer_email,
        JSON.stringify(o.raw_platform_data || {})].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const dir = sort.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    let av = a[sort.key], bv = b[sort.key];
    if (sort.key === 'intake_at') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
    if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return rows;
}

/* ── Stats (computed over all today's orders, not the filtered view) ── */
function renderStats() {
  const scope = ORDERS.filter(o => withinDate(o.intake_at));
  $('statTotal').textContent = scope.length;
  $('statPending').textContent = scope.filter(o => o.status === 'pending' && o.classification === 'Requires Review').length;
  $('statFlagged').textContent = scope.filter(o => o.status === 'flagged').length;
}

/* ── Table head ── */
function renderHead() {
  theadRow.innerHTML = COLUMNS.map(c => {
    const sorted = sort.key === c.key;
    const arrow = c.sort ? `<span class="arrow">${sorted ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>` : '';
    return `<th class="${c.sort ? 'sortable' : ''} ${sorted ? 'sorted' : ''}" data-key="${c.key}">${c.label}${arrow}</th>`;
  }).join('');
  theadRow.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
      else { sort.key = key; sort.dir = 'asc'; }
      render();
    });
  });
}

/* ── Table body ── */
function renderBody() {
  const rows = visibleOrders();
  $('feedSub').textContent = `${rows.length} order${rows.length === 1 ? '' : 's'} in view · unified across ${filters.platforms.size} channel${filters.platforms.size === 1 ? '' : 's'}`;
  if (!rows.length) {
    feedBody.innerHTML = `<tr><td colspan="${COLUMNS.length}"><div class="empty">No orders match the current filters.</div></td></tr>`;
    return;
  }
  feedBody.innerHTML = rows.map(o => {
    const { t, md } = fmtTime(o.intake_at);
    const stLabel = o.status.charAt(0).toUpperCase() + o.status.slice(1);
    return `<tr data-id="${o.id}" class="${o.id === selectedId ? 'sel' : ''}">
      <td><span class="st ${o.status}"><span class="dot"></span>${stLabel}</span></td>
      <td>${sourceBadge(o.source)}</td>
      <td class="mono">${t} <span style="color:var(--dim)">|</span> ${md}</td>
      <td class="mono">${escapeHtml(o.platform_order_no)}</td>
      <td class="uct">${escapeHtml(o.uct)}</td>
      <td class="cust"><div class="nm">${escapeHtml(o.customer_name || '—')}</div><div class="loc">${escapeHtml(o.customer_location || '')}</div></td>
      <td class="iq"><span class="a">${o.skus} SKUs</span><br><span class="b">(Total ${o.units} units)</span></td>
      <td class="val">${fmtMoney(o.total_value)}</td>
      <td>
        <select class="clsel" data-cls="${o.classification}" data-id="${o.id}" onclick="event.stopPropagation()">
          ${CLASSIFICATIONS.map(c => `<option ${c === o.classification ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </td>
      <td><button class="btn-view" data-id="${o.id}">View ▸</button></td>
    </tr>`;
  }).join('');

  // row click → open panel
  feedBody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => openPanel(tr.dataset.id));
  });
  // inline classification change
  feedBody.querySelectorAll('.clsel').forEach(sel => {
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const id = sel.dataset.id;
      await updateOrder(id, { classification: sel.value }, `Classified as “${sel.value}”`);
    });
  });
}

function render() { renderHead(); renderStats(); renderBody(); }

/* ── Intake & Classification panel ── */
function openPanel(id) {
  const o = ORDERS.find(x => x.id === id);
  if (!o) return;
  selectedId = id;
  panelDraft = { tags: [...(o.tags || [])], notes: o.notes || '', classification: o.classification };
  panel.classList.remove('hidden');
  panelActions.style.display = 'flex';
  panelBody.classList.remove('blank');
  panelBody.innerHTML = renderPanelBody(o);
  wirePanel(o);
  // highlight row
  feedBody.querySelectorAll('tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.id === id));
}

function renderPanelBody(o) {
  const src = (CHANNEL_META[o.source] || {}).label || o.source;
  const raw = JSON.stringify(o.raw_platform_data || {}, null, 2);
  return `
    <div class="pintake">Intake Details: <b>${escapeHtml(o.uct)}</b> (Source: ${escapeHtml(src)})</div>

    <div class="psec">
      <div class="lab">Raw Platform Data</div>
      <pre class="raw">${escapeHtml(raw)}</pre>
    </div>

    <div class="psec">
      <div class="lab">Standardized Fields</div>
      <div style="margin-bottom:10px;">
        <div class="sub" style="font-size:10.5px;color:var(--dim);margin-bottom:5px;text-transform:uppercase;letter-spacing:.03em;">Shipping Address</div>
        <textarea class="fieldbox" id="fShip" rows="2">${escapeHtml(o.ship_address || '')}</textarea>
      </div>
      <div class="two">
        <div>
          <div class="sub">Billing Info</div>
          <textarea class="fieldbox" id="fBill" rows="3">${escapeHtml(o.billing_info || '')}</textarea>
        </div>
        <div>
          <div class="sub">Billing Info</div>
          <textarea class="fieldbox" id="fBill2" rows="3">${escapeHtml(o.billing_info_alt || '')}</textarea>
        </div>
      </div>
    </div>

    <div class="psec">
      <div class="lab">Internal Classification</div>
      <div class="chips" id="chips"></div>
      <div class="addcls" id="addcls"></div>
      <textarea class="fieldbox" id="fNotes" rows="3" placeholder="Notes" style="margin-top:9px;">${escapeHtml(o.notes || '')}</textarea>
    </div>
  `;
}

function renderChips() {
  const chipsEl = $('chips');
  const addEl = $('addcls');
  if (!chipsEl) return;
  const tags = panelDraft.tags;
  chipsEl.innerHTML = tags.map((t, i) =>
    `<span class="chip">${escapeHtml(t)}<button class="rm" data-i="${i}" aria-label="Remove">×</button></span>`
  ).join('') + `<span class="chip notes">Notes</span>`;
  chipsEl.querySelectorAll('.rm').forEach(b => b.addEventListener('click', () => {
    panelDraft.tags.splice(Number(b.dataset.i), 1);
    renderChips();
  }));
  // add options = classifications not already present
  addEl.innerHTML = CLASSIFICATIONS.filter(c => !tags.includes(c))
    .map(c => `<button data-add="${c}">+ ${c}</button>`).join('');
  addEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    panelDraft.tags.push(b.dataset.add);
    renderChips();
  }));
}

function wirePanel(o) {
  renderChips();
  $('fNotes').addEventListener('input', e => panelDraft.notes = e.target.value);
}

function closePanel() {
  panel.classList.add('hidden');
  selectedId = null;
  feedBody.querySelectorAll('tr').forEach(tr => tr.classList.remove('sel'));
}

/* ── Persistence ── */
async function updateOrder(id, patch, okMsg) {
  const idx = ORDERS.findIndex(o => o.id === id);
  const prev = idx >= 0 ? { ...ORDERS[idx] } : null;
  if (idx >= 0) ORDERS[idx] = { ...ORDERS[idx], ...patch };
  render();
  if (selectedId === id && !panel.classList.contains('hidden')) {
    // keep panel in sync for status/classification changes
    const o = ORDERS[idx];
    if (o) { panelDraft.classification = o.classification; }
  }
  const { error } = await sb.from(TABLE).update(patch).eq('id', id);
  if (error) {
    console.error(error);
    if (prev && idx >= 0) ORDERS[idx] = prev; // rollback
    render();
    toast('Update failed — reverted.', 'err');
    return false;
  }
  if (okMsg) toast(okMsg, 'ok');
  return true;
}

function collectPanelPatch() {
  const patch = {
    tags: panelDraft.tags,
    notes: $('fNotes') ? $('fNotes').value : panelDraft.notes,
  };
  const ship = $('fShip'), bill = $('fBill'), bill2 = $('fBill2');
  if (ship) patch.ship_address = ship.value;
  if (bill) patch.billing_info = bill.value;
  if (bill2) patch.billing_info_alt = bill2.value;
  return patch;
}

async function actReject() {
  if (!selectedId) return;
  await updateOrder(selectedId, { ...collectPanelPatch(), status: 'flagged' }, 'Flagged for review');
}
async function actHold() {
  if (!selectedId) return;
  await updateOrder(selectedId, collectPanelPatch(), 'Saved & held');
}
async function actValidate() {
  if (!selectedId) return;
  const btn = $('btnValidate');
  btn.disabled = true; btn.textContent = 'Pushing…';
  const ok = await updateOrder(selectedId, { ...collectPanelPatch(), status: 'processed' }, 'Validated & pushed to fulfillment');
  btn.disabled = false; btn.textContent = 'Validate & Push to Fulfillment';
  if (ok) closePanel();
}

/* ── Filter menus ── */
function buildMenus() {
  // date
  const dateOpts = [['today', 'Today (Live)'], ['24h', 'Last 24 Hours'], ['7d', 'Last 7 Days'], ['all', 'All Time']];
  $('dateMenu').innerHTML = dateOpts.map(([v, l]) =>
    `<div class="opt radio ${filters.dateRange === v ? 'on' : ''}" data-v="${v}"><span class="box">${filters.dateRange === v ? tick() : ''}</span>${l}</div>`).join('');
  $('dateMenu').querySelectorAll('.opt').forEach(o => o.addEventListener('click', () => {
    filters.dateRange = o.dataset.v;
    $('dateLabel').textContent = dateOpts.find(d => d[0] === o.dataset.v)[1];
    buildMenus(); render(); closeMenus();
  }));

  // platforms (multi) — active channels come from config
  $('platformMenu').innerHTML = CHANNELS.map(k =>
    `<div class="opt ${filters.platforms.has(k) ? 'on' : ''}" data-v="${k}"><span class="box">${filters.platforms.has(k) ? tick() : ''}</span>${(CHANNEL_META[k] || {}).label || k}</div>`).join('');
  $('platformMenu').querySelectorAll('.opt').forEach(o => o.addEventListener('click', e => {
    e.stopPropagation();
    const k = o.dataset.v;
    if (filters.platforms.has(k)) filters.platforms.delete(k); else filters.platforms.add(k);
    if (filters.platforms.size === 0) filters.platforms.add(k); // never empty
    updatePlatformLabel(); buildMenus(); render();
  }));

  // status (single)
  const stOpts = [['all', 'All Intake'], ['pending', 'Pending'], ['flagged', 'Flagged'], ['processed', 'Processed']];
  $('statusMenu').innerHTML = stOpts.map(([v, l]) =>
    `<div class="opt radio ${filters.status === v ? 'on' : ''}" data-v="${v}"><span class="box">${filters.status === v ? tick() : ''}</span>${l}</div>`).join('');
  $('statusMenu').querySelectorAll('.opt').forEach(o => o.addEventListener('click', () => {
    filters.status = o.dataset.v;
    $('statusLabel').textContent = stOpts.find(s => s[0] === o.dataset.v)[1];
    buildMenus(); render(); closeMenus();
  }));
}
function updatePlatformLabel() {
  const n = filters.platforms.size, total = CHANNELS.length;
  $('platformLabel').textContent = n === total ? 'All Selected' : `${n} of ${total}`;
}
const tick = () => `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><path d="M5 13l4 4L19 7"/></svg>`;

function closeMenus() { document.querySelectorAll('.selpill.open').forEach(p => p.classList.remove('open')); }

/* ── Sync ── */
async function sync() {
  const btn = $('syncBtn');
  btn.classList.add('syncing');
  await loadOrders();
  setTimeout(() => btn.classList.remove('syncing'), 500);
  toast('Feed synced', 'ok');
}

/* ── Toast ── */
let toastT;
function toast(msg, kind = 'ok') {
  const el = $('toast');
  el.className = 'toast show ' + kind;
  $('toastMsg').textContent = msg;
  el.querySelector('.ic').textContent = kind === 'ok' ? '✓' : kind === 'warn' ? '!' : '×';
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ── Utils ── */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Wire global controls ── */
$('search').addEventListener('input', e => { filters.search = e.target.value; renderBody(); });
$('syncBtn').addEventListener('click', sync);
$('panelClose').addEventListener('click', closePanel);
$('btnReject').addEventListener('click', actReject);
$('btnHold').addEventListener('click', actHold);
$('btnValidate').addEventListener('click', actValidate);

// dropdown open/close
document.querySelectorAll('.selpill > button').forEach(b => {
  b.addEventListener('click', e => {
    e.stopPropagation();
    const pill = b.closest('.selpill');
    const wasOpen = pill.classList.contains('open');
    closeMenus();
    if (!wasOpen) pill.classList.add('open');
  });
});
document.addEventListener('click', closeMenus);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenus(); if (!panel.classList.contains('hidden')) closePanel(); } });

/* ── Boot ── */
async function boot() {
  CONFIG = await loadConfig();
  applyBranding(CONFIG);
  TABLE = CONFIG.backend.table;
  CLASSIFICATIONS = CONFIG.classifications;
  CHANNELS = CONFIG.channels.filter(c => CHANNEL_META[c]); // keep only channels we can render
  if (!CHANNELS.length) CHANNELS = Object.keys(CHANNEL_META);
  filters.platforms = new Set(CHANNELS);
  sb = supabase.createClient(CONFIG.backend.supabaseUrl, CONFIG.backend.supabaseAnonKey);
  buildMenus();
  updatePlatformLabel();
  loadOrders();
}
boot();

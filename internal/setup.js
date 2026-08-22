/* ============ SET SOMEONE UP ============ */
/* The owner's side. Make a space, choose the face, pick the tools, hand over   */
/* the link. Works the same for a partner setting up their own clients — they   */
/* see their people and nobody else's, because the server filters by parent.    */
/*                                                                             */
/*   setup.html?who=<your slug>&k=<your access key>                            */

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const p = new URLSearchParams(location.search);
  const who = (p.get('who') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const key = p.get('k') || '';

  /* What each face looks like, so the choice is a colour and not a word. */
  const FACE_LOOK = {
    skrewu:   { label: 'SKREW U', dot: '#c4f135', for: 'ours' },
    pro:      { label: 'Studio',  dot: '#1d6fe0', for: 'corporate' },
    sport:    { label: 'Team',    dot: '#ffd400', for: 'schools & clubs' },
    tropical: { label: 'Island',  dot: '#ffc247', for: 'island shops' },
    critters: { label: 'Critters',dot: '#2e9e6b', for: 'pet shops' },
  };
  const TOOL_LABEL = {
    locker: 'Locker', shirts: 'Shirts', gangsheet: 'Gang sheets', sticker: 'Stickers',
    blanks: 'Blanks', omniflow: 'Orders', wholesale: 'Wholesale form', live: 'Live overlay',
  };

  let faces = [], tools = [];
  let face = 'pro';
  let picked = new Set(['locker', 'shirts', 'gangsheet']);

  function say(text, bad) {
    const m = $('msg');
    m.textContent = text;
    m.classList.toggle('bad', !!bad);
    m.classList.add('show');
  }

  const slugify = (s) => String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  async function api(action, extra = {}) {
    const res = await fetch('/api/tenants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, who, key, ...extra }),
    });
    return await res.json();
  }

  function renderFaces() {
    $('faces').innerHTML = faces.map(f => {
      const look = FACE_LOOK[f] || { label: f, dot: '#7f95b0', for: '' };
      return `<button class="chip${face === f ? ' on' : ''}" data-f="${esc(f)}" type="button">
        <span class="sw" style="background:${look.dot}"></span>${esc(look.label)}
        ${look.for ? `<span style="opacity:.55"> · ${esc(look.for)}</span>` : ''}</button>`;
    }).join('');
    $('faces').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
      face = b.dataset.f; renderFaces();
    }));
  }

  function renderTools() {
    $('tools').innerHTML = tools.map(t =>
      `<button class="chip${picked.has(t) ? ' on' : ''}" data-t="${esc(t)}" type="button">${esc(TOOL_LABEL[t] || t)}</button>`
    ).join('');
    $('tools').querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.t;
      if (picked.has(t)) picked.delete(t); else picked.add(t);
      renderTools();
    }));
  }

  function linkFor(person) {
    return `${location.origin}/locker.html?who=${encodeURIComponent(person.slug)}&k=${encodeURIComponent(person.access_key)}`;
  }

  function renderPeople(list) {
    if (!list.length) {
      $('people').innerHTML = `<div class="empty">Nobody yet. Make the first space above.</div>`;
      return;
    }
    $('people').innerHTML = list.map(x => {
      const f = (x.shop || {}).theme || 'pro';
      const look = FACE_LOOK[f] || { label: f };
      return `<div class="p${x.active ? '' : ' off'}">
        <span class="nm"><b>${esc(x.name)}</b>
          <span>${esc((x.tools || []).map(t => TOOL_LABEL[t] || t).join(' · ') || 'no tools yet')}</span></span>
        <span class="face">${esc(look.label)}</span>
        <button data-copy="${esc(x.slug)}" type="button">Copy link</button>
        <button data-toggle="${esc(x.slug)}" type="button">${x.active ? 'Pause' : 'Switch on'}</button>
      </div>`;
    }).join('');

    $('people').querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const person = list.find(x => x.slug === b.dataset.copy);
      const url = linkFor(person);
      try { await navigator.clipboard.writeText(url); b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy link', 1600); }
      catch { say(url); }
    }));
    $('people').querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      const person = list.find(x => x.slug === b.dataset.toggle);
      const r = await api('update', { slug: person.slug, active: !person.active });
      if (!r.ok) { say(r.error || 'Couldn’t change that', true); return; }
      load();
    }));
  }

  async function load() {
    const r = await api('list');
    if (!r.ok) {
      $('people').innerHTML = `<div class="empty">${esc(r.error || 'Could not load')}</div>`;
      $('create').disabled = true;
      say(r.error || 'Open this from your own link — setup.html?who=you&k=yourkey', true);
      return;
    }
    $('meLabel').textContent = `${r.me.name} · ${r.me.kind}`;
    faces = r.faces; tools = r.tools;
    renderFaces(); renderTools();
    renderPeople(r.people || []);
  }

  $('name').addEventListener('input', (e) => {
    const s = slugify(e.target.value);
    $('slugPreview').textContent = s ? `/locker.html?who=${s}` : '…';
  });

  $('create').addEventListener('click', async () => {
    const name = $('name').value.trim();
    if (!name) { say('Give them a name first', true); return; }
    const btn = $('create'); btn.disabled = true; const was = btn.textContent; btn.textContent = 'Making it…';
    try {
      const r = await api('create', { name, theme: face, tools: [...picked] });
      if (!r.ok) { say(r.error || 'Couldn’t make that space', true); return; }
      $('linkUrl').textContent = linkFor(r.person);
      $('link').classList.add('show');
      $('msg').classList.remove('show');
      $('name').value = ''; $('slugPreview').textContent = '…';
      load();
    } catch (e) {
      say('Could not reach the server: ' + e.message, true);
    } finally { btn.disabled = false; btn.textContent = was; }
  });

  if (!who || !key) {
    say('Open this from your own link — setup.html?who=you&k=yourkey', true);
    $('create').disabled = true;
    $('people').innerHTML = '<div class="empty">Not connected.</div>';
    renderFaces(); renderTools();
  } else {
    load();
  }
})();

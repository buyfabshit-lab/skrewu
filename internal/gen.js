/* ============ AI IMAGE / AI VIDEO · one engine ============ */
/* The page says which it is (body data-kind="image|video"); everything else  */
/* is the same: a prompt, a settings sheet, a wall of results.                */
/*                                                                            */
/* The settings sheet is copied, on purpose, from the nicest one we've seen:  */
/* a two-column grid of aspect ratios each wearing a little box shaped like   */
/* itself, resolution chips, batch count. If a layout already reads perfectly */
/* on a phone there's no prize for inventing a worse one.                     */
/*                                                                            */
/* What the sheet offers is not decided here. The server says which provider */
/* stands behind the door and what it takes — shapes, sizes, whether it can  */
/* batch, whether a campaign preset and a product photo mean anything — and  */
/* the sheet draws exactly that. With Higgsfield behind it, an image is a    */
/* ticket to poll, the same way a video already was.                         */

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const KIND = document.body.dataset.kind === 'video' ? 'video' : 'image';
  const STORE = 'skrewu_gen_' + KIND;

  /* Runs cost credits, so the tool has to say who it's for — same link
     credential as everything else on the line. */
  const q = new URLSearchParams(location.search);
  const WHO = (q.get('who') || q.get('shop') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const KEY = q.get('k') || '';
  let balance = null, prices = null, surcharge = 0;

  /* What the sheet offers, until the server says otherwise. Video keeps the
     short list because that's what the models actually take. */
  let ASPECTS = KIND === 'image'
    ? ['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5']
    : ['16:9', '9:16', '1:1'];

  let SETTINGS = KIND === 'image'
    ? [
        { key: 'resolution', label: 'Resolution', icon: '❋', options: ['1K', '2K'] },
        { key: 'batch', label: 'Batch size', icon: '🗇', options: ['1', '2', '3', '4'] },
      ]
    : [
        { key: 'duration', label: 'Length', icon: '◷', options: ['5', '10'], unit: 's' },
      ];

  const DEFAULTS = KIND === 'image'
    ? { aspect: '1:1', resolution: '1K', batch: '1' }
    : { aspect: '9:16', duration: '5' };

  let chosen = { ...DEFAULTS };
  try { chosen = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(chosen)); } catch {} };

  let ready = null;   // null = unknown yet; the button stays honest either way
  let caps = null;    // what the image side of the door can take, from the server

  /* Campaign mode: a preset from the catalog, a product photo and maybe a
     model reference. Chosen per visit, not remembered — a preset is a
     decision about this picture, not a preference. */
  let presets = [];                      // [{id, name}]
  let preset = null;                     // the chosen id, or null for none
  let product = null, model = null;      // locker image urls
  let locker = null;                     // [{url, name}] once loaded

  /* ---------- the sheet ---------- */

  function glyph(aspect) {
    const [w, h] = aspect.split(':').map(Number);
    const long = 18, s = long / Math.max(w, h);
    return `<span class="glyph" style="width:${Math.max(6, Math.round(w * s))}px;height:${Math.max(6, Math.round(h * s))}px"></span>`;
  }

  function drawSheet() {
    $('aspects').innerHTML = ASPECTS.map(a =>
      `<button type="button" class="opt${chosen.aspect === a ? ' sel' : ''}" data-aspect="${a}">
         ${glyph(a)}<span>${a}</span></button>`).join('');
    $('aspects').querySelectorAll('[data-aspect]').forEach(b =>
      b.addEventListener('click', () => { chosen.aspect = b.dataset.aspect; save(); drawSheet(); summarize(); }));

    $('extras').innerHTML = SETTINGS.map(s => `
      <div class="sec"><span>${s.icon}</span><span>${s.label}</span></div>
      <div class="opts wide">${s.options.map(o =>
        `<button type="button" class="opt center${chosen[s.key] === o ? ' sel' : ''}"
                 data-k="${s.key}" data-v="${o}">${o}${s.unit || ''}</button>`).join('')}</div>`).join('');
    $('extras').querySelectorAll('[data-k]').forEach(b =>
      b.addEventListener('click', () => { chosen[b.dataset.k] = b.dataset.v; save(); drawSheet(); summarize(); }));

    drawCampaign();
  }

  /* The campaign section only exists when the provider behind the door can
     use it. It is drawn empty otherwise, so the sheet looks the same as it
     always did on fal. */
  function drawCampaign() {
    const box = $('campaign');
    if (!box) return;
    if (!caps || !(caps.presets || caps.references)) { box.innerHTML = ''; return; }

    let html = '';
    if (caps.presets) {
      html += `<div class="sec"><span>✦</span><span>Campaign preset</span>
                 <em>${surcharge ? '+' + Math.round(surcharge * 100) + '%' : ''}</em></div>`;
      html += `<div class="opts wide" id="presetOpts">
        <button type="button" class="opt center${preset ? '' : ' sel'}" data-preset="">None</button>
        ${presets.map(p => `<button type="button" class="opt center${preset === p.id ? ' sel' : ''}"
            data-preset="${esc(p.id)}" title="${esc(p.name)}">${esc(p.name)}</button>`).join('')}
        ${presets.length ? '' : '<span class="hint">Catalog loading…</span>'}
      </div>`;
    }
    if (caps.references) {
      html += pickerHtml('product', 'Product photo', product,
        preset ? 'A preset needs one.' : 'Optional — the model edits it instead of starting blank.');
      html += pickerHtml('model', 'Model reference', model,
        'Optional — who wears it. Without one the shot stays product-only.');
    }
    box.innerHTML = html;

    box.querySelectorAll('[data-preset]').forEach(b =>
      b.addEventListener('click', () => { preset = b.dataset.preset || null; drawCampaign(); summarize(); }));
    box.querySelectorAll('[data-pick]').forEach(b =>
      b.addEventListener('click', () => openPicker(b.dataset.pick)));
    box.querySelectorAll('[data-clear]').forEach(b =>
      b.addEventListener('click', () => { if (b.dataset.clear === 'product') product = null; else model = null; drawCampaign(); summarize(); }));
  }

  function pickerHtml(slot, label, url, hint) {
    return `<div class="sec"><span>▣</span><span>${label}</span></div>
      <div class="refrow">
        <button type="button" class="ref${url ? ' has' : ''}" data-pick="${slot}" aria-label="Choose ${label}">
          ${url ? `<img src="${esc(url)}" alt="">` : '<span>From the locker</span>'}
        </button>
        <div class="refmeta">
          <span class="hint">${esc(hint)}</span>
          ${url ? `<button type="button" class="clear" data-clear="${slot}">Clear</button>` : ''}
        </div>
      </div>`;
  }

  /* ---------- the locker picker ----------
   *
   * The shop's own locker is the one place a product photo is sure to be:
   * logos dragged in, photos from listings, and everything these tools have
   * made before. It's read through the locker door with the same link
   * credential, so it only ever shows this shop's things. */

  let picking = null;

  async function loadLocker() {
    if (locker) return locker;
    const res = await fetch('/api/locker', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', who: WHO, key: KEY, table: 'logos' }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || 'Could not open the locker.');
    locker = (d.rows || []).filter(r => r && r.url).map(r => ({ url: r.url, name: r.name || '' }));
    return locker;
  }

  async function openPicker(slot) {
    picking = slot;
    const pk = $('picker');
    pk.querySelector('h2').textContent = slot === 'product' ? 'Product photo' : 'Model reference';
    const grid = $('pickerGrid');
    grid.innerHTML = '<span class="hint">Opening the locker…</span>';
    document.body.classList.add('picker-open');
    try {
      const rows = await loadLocker();
      if (!rows.length) {
        grid.innerHTML = `<span class="hint">Nothing in the locker yet — drop a photo in at
          <a href="locker.html?who=${encodeURIComponent(WHO)}&k=${encodeURIComponent(KEY)}">the locker</a> first.</span>`;
        return;
      }
      const current = slot === 'product' ? product : model;
      grid.innerHTML = rows.map(r =>
        `<button type="button" class="thumb${current === r.url ? ' sel' : ''}" data-url="${esc(r.url)}" title="${esc(r.name)}">
           <img src="${esc(r.url)}" alt="" loading="lazy"></button>`).join('');
      grid.querySelectorAll('[data-url]').forEach(b => b.addEventListener('click', () => {
        if (picking === 'product') product = b.dataset.url; else model = b.dataset.url;
        closePicker(); drawCampaign(); summarize();
      }));
    } catch (e) {
      grid.innerHTML = `<span class="hint bad">${esc(e.message)}</span>`;
    }
  }
  function closePicker() { document.body.classList.remove('picker-open'); picking = null; }

  /* What this exact run will cost, from the server's price list — the page
     never invents a number of its own. A preset costs the surcharge the
     server quoted, rounded up the same way it rounds. */
  function costNow() {
    if (!prices) return null;
    if (KIND === 'video') return prices.video[chosen.duration];
    const base = prices.image[chosen.resolution];
    if (base == null) return null;
    const each = preset ? Math.ceil(Math.round(base * (1 + surcharge) * 100) / 100) : base;
    return each * (caps && caps.batch === false ? 1 : Number(chosen.batch) || 1);
  }

  function summarize() {
    const bits = [chosen.aspect];
    SETTINGS.forEach(s => bits.push(chosen[s.key] + (s.unit || '')));
    if (preset) {
      const p = presets.find(x => x.id === preset);
      bits.push(p ? p.name : 'preset');
    }
    if (product || model) bits.push((product && model) ? '2 refs' : '1 ref');
    const c = costNow();
    if (c != null) bits.push(c.toLocaleString('en-US') + ' cr');
    $('summary').textContent = bits.join(' · ');
    const go = $('go');
    if (c != null && balance != null) {
      go.textContent = balance >= c ? 'Make it' : 'Top up';
    }
    showBalance();
  }

  function showBalance() {
    const el = $('bal');
    if (!el) return;
    if (balance == null) { el.textContent = ''; return; }
    const c = costNow();
    el.innerHTML = `<a href="credits.html?who=${encodeURIComponent(WHO)}&k=${encodeURIComponent(KEY)}">` +
      `<b>${balance.toLocaleString('en-US')}</b> credits</a>`;
    el.classList.toggle('low', c != null && balance < c);
  }

  const open = () => document.body.classList.add('sheet-open');
  const close = () => document.body.classList.remove('sheet-open');
  $('settingsBtn').addEventListener('click', open);
  $('closeSheet').addEventListener('click', close);
  $('doneSheet').addEventListener('click', close);
  $('scrim').addEventListener('click', () => { if (picking) closePicker(); else close(); });
  if ($('closePicker')) $('closePicker').addEventListener('click', closePicker);

  /* ---------- making things ---------- */

  function say(msg, bad) {
    const n = $('note');
    n.textContent = msg || '';
    n.classList.toggle('bad', !!bad);
  }

  function pieceHtml(url) {
    if (KIND === 'video') {
      return `<div class="piece"><video src="${esc(url)}" controls playsinline loop></video>
        <div class="row"><span>${esc(chosen.aspect)}</span><a href="${esc(url)}" download target="_blank" rel="noopener">Download</a></div></div>`;
    }
    const tag = chosen.aspect + ' · ' + chosen.resolution + (preset ? ' · preset' : '');
    return `<div class="piece"><img src="${esc(url)}" alt="">
      <div class="row"><span>${esc(tag)}</span>
      <a href="${esc(url)}" download target="_blank" rel="noopener">Download</a></div></div>`;
  }

  function cookingCard(label) {
    const el = document.createElement('div');
    el.className = 'piece';
    el.innerHTML = `<div class="cooking"><span class="dot"></span><span>${esc(label)}</span></div>`;
    return el;
  }

  /* A finished image lands on the wall. If the copy into the locker failed the
     picture is still shown, and the note says so instead of implying it was
     kept. */
  function land(d) {
    (d.images || []).forEach(u => $('wall').insertAdjacentHTML('afterbegin', pieceHtml(u)));
    if (d.saveError) say('Made, but not filed in the locker: ' + d.saveError, true);
    else say('');
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function makeImage(prompt) {
    const n = (caps && caps.batch === false) ? 1 : Number(chosen.batch);
    const holder = cookingCard('Making ' + (n > 1 ? n + ' pieces' : 'it') + '…');
    $('wall').prepend(holder);
    try {
      const refs = [];
      if (product) refs.push(product);
      if (model) refs.push(model);
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who: WHO, k: KEY, kind: 'image', prompt, aspect: chosen.aspect,
          resolution: chosen.resolution, batch: n,
          ...(preset ? { preset } : {}), ...(refs.length ? { images: refs } : {}) }),
      });
      const d = await res.json();
      if (typeof d.balance === 'number') { balance = d.balance; summarize(); }
      if (!d.ok) throw new Error(d.error || 'It didn’t come back.');

      if (!d.job) {           // answered straight away
        holder.remove();
        land(d);
        return;
      }

      // A ticket. Ask after it until the picture exists — 4K takes a while,
      // and the card says so instead of pretending.
      holder.querySelector('.cooking span:last-child').textContent =
        chosen.resolution === '4K' ? 'In the queue — 4K takes a minute or two…' : 'In the queue…';
      for (let i = 0; i < 120; i++) {
        await sleep(3000);
        const pr = await fetch('/api/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ who: WHO, k: KEY, kind: 'image', job: d.job, run: d.run }),
        });
        const p = await pr.json();
        if (typeof p.balance === 'number') { balance = p.balance; summarize(); }
        if (!p.ok) throw new Error(p.error || 'Lost the job.');
        if (p.done) { holder.remove(); land(p); return; }
      }
      throw new Error('Took too long — it may still finish; check the locker in a bit.');
    } catch (e) {
      holder.remove();
      say(e.message, true);
    }
  }

  async function makeVideo(prompt) {
    const holder = cookingCard('In the oven — a few minutes…');
    $('wall').prepend(holder);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who: WHO, k: KEY, kind: 'video', prompt,
          aspect: chosen.aspect, duration: chosen.duration }),
      });
      const d = await res.json();
      if (typeof d.balance === 'number') { balance = d.balance; summarize(); }
      if (!d.ok || !d.job) throw new Error(d.error || 'It didn’t start.');

      // Poll the ticket until the video exists. Video is minutes, not seconds,
      // and the card says so instead of pretending.
      for (let i = 0; i < 150; i++) {
        await sleep(4000);
        const pr = await fetch('/api/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ who: WHO, k: KEY, kind: 'video',
            job: d.job, run: d.run, charged: d.charged }),
        });
        const p = await pr.json();
        if (typeof p.balance === 'number') { balance = p.balance; summarize(); }
        if (!p.ok) throw new Error(p.error || 'Lost the job.');
        if (p.done) {
          holder.remove();
          $('wall').insertAdjacentHTML('afterbegin', pieceHtml(p.url));
          say('');
          return;
        }
      }
      throw new Error('Took too long — it may still finish; try again in a bit.');
    } catch (e) {
      holder.remove();
      say(e.message, true);
    }
  }

  const topUp = () => `credits.html?who=${encodeURIComponent(WHO)}&k=${encodeURIComponent(KEY)}`;
  const KEYNAME = () => (KIND === 'image' && caps && caps.provider === 'higgsfield') ? 'HF_KEY' : 'FAL_KEY';

  $('go').addEventListener('click', async () => {
    if (!WHO || !KEY) {
      say('Open this from your own link — ?who=you&k=yourkey', true);
      return;
    }
    if (ready === false) {
      say(`Not connected yet — a ${KEYNAME()} in Netlify switches this on.`, true);
      return;
    }
    if (preset && !product) { say('A preset needs a product photo — pick one in settings.', true); open(); return; }

    // Short of credits: send them to buy some instead of failing at them.
    const c = costNow();
    if (c != null && balance != null && balance < c) { location.href = topUp(); return; }

    const prompt = $('prompt').value.trim();
    if (!prompt) { say('Say what to make first.', true); return; }

    const btn = $('go'); btn.disabled = true;
    try { await (KIND === 'image' ? makeImage(prompt) : makeVideo(prompt)); }
    finally { btn.disabled = false; }
  });

  /* The server says what the image side of the door takes. The sheet is
     redrawn to match, and a remembered choice that no longer exists falls
     back to the default rather than being sent and refused. */
  function applyCaps(c) {
    caps = c || null;
    if (KIND !== 'image' || !caps) return;
    if (Array.isArray(caps.aspects) && caps.aspects.length) ASPECTS = caps.aspects;
    const res = Array.isArray(caps.resolutions) && caps.resolutions.length ? caps.resolutions : ['1K', '2K'];
    SETTINGS = [{ key: 'resolution', label: 'Resolution', icon: '❋', options: res }];
    if (caps.batch !== false) SETTINGS.push({ key: 'batch', label: 'Batch size', icon: '🗇', options: ['1', '2', '3', '4'] });
    if (!ASPECTS.includes(chosen.aspect)) chosen.aspect = DEFAULTS.aspect;
    if (!res.includes(chosen.resolution)) chosen.resolution = DEFAULTS.resolution;
    if (caps.batch === false) chosen.batch = '1';
    save();
  }

  async function loadPresets() {
    if (!caps || !caps.presets || !WHO || !KEY) return;
    try {
      const res = await fetch(`/api/generate?presets=1&who=${encodeURIComponent(WHO)}&k=${encodeURIComponent(KEY)}`,
                              { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) presets = d.presets || [];
    } catch { /* the sheet says the catalog is loading; a retry is a reopen */ }
    drawCampaign();
  }

  /* Ask the server whether this tool is switched on, and what the shop has to
     spend — never pretend on either count. */
  (async () => {
    try {
      const res = await fetch('/api/generate');
      const d = await res.json();
      applyCaps(d && d.image);
      ready = KIND === 'image' ? !!(d && d.image && d.image.ready) : !!(d && d.video && d.video.ready);
      if (!ready) say(`Not connected yet — everything here works the moment a ${KEYNAME()} is set in Netlify.`);
    } catch { ready = null; /* unknown; let a real click find out */ }
    drawSheet();
    summarize();

    if (!WHO || !KEY) {
      say('Open this from your own link — ?who=you&k=yourkey, so runs can be paid for.');
      return;
    }
    loadPresets();
    try {
      const res = await fetch(`/api/credits?who=${encodeURIComponent(WHO)}&k=${encodeURIComponent(KEY)}`,
                              { cache: 'no-store' });
      const d = await res.json();
      if (!d.ok) { say(d.error || 'Could not read your credits.', true); return; }
      balance = d.balance; prices = d.prices; surcharge = Number(d.presetSurcharge) || 0;
      summarize();
      if (balance < (costNow() || 0)) {
        say(`Not enough credits for this run — ${balance.toLocaleString('en-US')} left.`);
      }
    } catch { /* the tool still works; the first run will report properly */ }
  })();

  drawSheet();
  summarize();
})();

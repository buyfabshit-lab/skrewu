/* ============ AI IMAGE / AI VIDEO · one engine ============ */
/* The page says which it is (body data-kind="image|video"); everything else  */
/* is the same: a prompt, a settings sheet, a wall of results.                */
/*                                                                            */
/* The settings sheet is copied, on purpose, from the nicest one we've seen:  */
/* a two-column grid of aspect ratios each wearing a little box shaped like   */
/* itself, resolution chips, batch count. If a layout already reads perfectly */
/* on a phone there's no prize for inventing a worse one.                     */

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
  let balance = null, prices = null;

  /* What the sheet offers. Video keeps the short list because that's what
     the models actually take; image gets the full ten. */
  const ASPECTS = KIND === 'image'
    ? ['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5']
    : ['16:9', '9:16', '1:1'];

  const SETTINGS = KIND === 'image'
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
  }

  /* What this exact run will cost, from the server's price list — the page
     never invents a number of its own. */
  function costNow() {
    if (!prices) return null;
    return KIND === 'image'
      ? prices.image[chosen.resolution] * Number(chosen.batch)
      : prices.video[chosen.duration];
  }

  function summarize() {
    const bits = [chosen.aspect];
    SETTINGS.forEach(s => bits.push(chosen[s.key] + (s.unit || '')));
    const c = costNow();
    if (c != null) bits.push(c.toLocaleString('en-US') + ' cr');
    $('summary').textContent = bits.join(' · ');
    const go = $('go');
    if (c != null && balance != null) {
      go.textContent = balance >= c ? 'Make it' : 'Top up';
    }
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
  $('scrim').addEventListener('click', close);

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
    return `<div class="piece"><img src="${esc(url)}" alt="">
      <div class="row"><span>${esc(chosen.aspect)} · ${esc(chosen.resolution)}</span>
      <a href="${esc(url)}" download target="_blank" rel="noopener">Download</a></div></div>`;
  }

  function cookingCard(label) {
    const el = document.createElement('div');
    el.className = 'piece';
    el.innerHTML = `<div class="cooking"><span class="dot"></span><span>${esc(label)}</span></div>`;
    return el;
  }

  async function makeImage(prompt) {
    const holder = cookingCard('Making ' + (chosen.batch > 1 ? chosen.batch + ' pieces' : 'it') + '…');
    $('wall').prepend(holder);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who: WHO, k: KEY, kind: 'image', prompt, aspect: chosen.aspect,
          resolution: chosen.resolution, batch: Number(chosen.batch) }),
      });
      const d = await res.json();
      if (typeof d.balance === 'number') { balance = d.balance; showBalance(); summarize(); }
      if (!d.ok) throw new Error(d.error || 'It didn’t come back.');
      holder.remove();
      d.images.forEach(u => $('wall').insertAdjacentHTML('afterbegin', pieceHtml(u)));
      say('');
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
      if (typeof d.balance === 'number') { balance = d.balance; showBalance(); summarize(); }
      if (!d.ok || !d.job) throw new Error(d.error || 'It didn’t start.');

      // Poll the ticket until the video exists. Video is minutes, not seconds,
      // and the card says so instead of pretending.
      for (let i = 0; i < 150; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const pr = await fetch('/api/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ who: WHO, k: KEY, kind: 'video',
            job: d.job, run: d.run, charged: d.charged }),
        });
        const p = await pr.json();
        if (typeof p.balance === 'number') { balance = p.balance; showBalance(); summarize(); }
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

  $('go').addEventListener('click', async () => {
    if (!WHO || !KEY) {
      say('Open this from your own link — ?who=you&k=yourkey', true);
      return;
    }
    if (ready === false) {
      say('Not connected yet — a FAL_KEY in Netlify switches this on.', true);
      return;
    }
    // Short of credits: send them to buy some instead of failing at them.
    const c = costNow();
    if (c != null && balance != null && balance < c) { location.href = topUp(); return; }

    const prompt = $('prompt').value.trim();
    if (!prompt) { say('Say what to make first.', true); return; }

    const btn = $('go'); btn.disabled = true;
    try { await (KIND === 'image' ? makeImage(prompt) : makeVideo(prompt)); }
    finally { btn.disabled = false; }
  });

  /* Ask the server whether this tool is switched on, and what the shop has to
     spend — never pretend on either count. */
  (async () => {
    try {
      const res = await fetch('/api/generate');
      const d = await res.json();
      ready = !!(d && d.ready);
      if (!ready) say('Not connected yet — everything here works the moment a FAL_KEY is set in Netlify.');
    } catch { ready = null; /* unknown; let a real click find out */ }

    if (!WHO || !KEY) {
      say('Open this from your own link — ?who=you&k=yourkey, so runs can be paid for.');
      return;
    }
    try {
      const res = await fetch(`/api/credits?who=${encodeURIComponent(WHO)}&k=${encodeURIComponent(KEY)}`,
                              { cache: 'no-store' });
      const d = await res.json();
      if (!d.ok) { say(d.error || 'Could not read your credits.', true); return; }
      balance = d.balance; prices = d.prices;
      showBalance(); summarize();
      if (balance < (costNow() || 0)) {
        say(`Not enough credits for this run — ${balance.toLocaleString('en-US')} left.`);
      }
    } catch { /* the tool still works; the first run will report properly */ }
  })();

  drawSheet();
  summarize();
})();

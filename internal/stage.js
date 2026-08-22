/* ============ STAGE CONTROL ============ */
/* The buttons live HERE, on your phone — not on the stream. A livestream is   */
/* video: nobody watching can tap it. So you drive the overlay from this page  */
/* while you talk, and the overlay picks up the change on its next check.      */
/*                                                                            */
/*   stage.html?shop=<slug>&k=<access key>                                    */

(function () {
  const $ = (id) => document.getElementById(id);
  const p = new URLSearchParams(location.search);
  const shop = (p.get('shop') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const key = p.get('k') || '';

  const PANELS = [
    ['tally', 'Counter'],
    ['feed', 'Orders'],
    ['drop', 'What you’re pushing'],
    ['media', 'Picture / clip'],
  ];
  let showing = PANELS.map(x => x[0]);
  let kind = 'image';

  function say(text, bad) {
    const m = $('msg');
    m.textContent = text;
    m.classList.toggle('bad', !!bad);
    m.classList.add('show');
  }

  function renderPanels() {
    $('panels').innerHTML = PANELS.map(([id, label]) =>
      `<button data-p="${id}" type="button" class="${showing.includes(id) ? 'on' : ''}">${label}</button>`
    ).join('');
    $('panels').querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.p;
      showing = showing.includes(id) ? showing.filter(x => x !== id) : showing.concat(id);
      renderPanels();
    }));
  }

  function renderKind() {
    document.querySelectorAll('[data-kind]').forEach(b =>
      b.classList.toggle('on', b.dataset.kind === kind));
  }
  document.querySelectorAll('[data-kind]').forEach(b =>
    b.addEventListener('click', () => { kind = b.dataset.kind; renderKind(); }));

  if (!shop || !key) {
    say('Open this from your own link — stage.html?shop=yourshop&k=yourkey', true);
    $('save').disabled = true;
    renderPanels();
    return;
  }

  $('how').innerHTML =
    '<b>Your overlay link</b><br>' +
    `live.html?shop=${shop}&amp;k=… — add <b>&amp;bg=1</b> while you position it, then take it off ` +
    'so the background goes clear. A tall source lays itself out for TikTok on its own.';

  function fill(stage) {
    $('logo').value = stage.logo || '';
    $('headline').value = stage.headline || '';
    $('sub').value = stage.sub || '';
    $('media').value = (stage.media && stage.media.url) || '';
    kind = (stage.media && stage.media.kind) === 'video' ? 'video' : 'image';
    if (Array.isArray(stage.show) && stage.show.length) showing = stage.show.slice();
    renderKind();
    renderPanels();
  }

  async function load() {
    try {
      const res = await fetch(`/api/live?shop=${encodeURIComponent(shop)}&k=${encodeURIComponent(key)}&limit=1`,
        { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) { say(data.error || 'Could not read your stage', true); return; }
      $('dot').classList.add('on');
      $('shopLabel').textContent = data.shop.name || shop;
      fill(data.stage || {});
    } catch (e) {
      say('Could not reach the server: ' + e.message, true);
      renderPanels();
    }
  }

  async function put(stage, done) {
    const btn = $('save');
    btn.disabled = true;
    const was = btn.textContent;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch(`/api/live?shop=${encodeURIComponent(shop)}&k=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      const data = await res.json();
      if (!data.ok) { say(data.error || 'It didn’t take', true); return; }
      fill(data.stage || {});
      say(done);
    } catch (e) {
      say('Could not reach the server: ' + e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = was;
    }
  }

  $('save').addEventListener('click', () => {
    const media = $('media').value.trim();
    put({
      logo: $('logo').value.trim(),
      headline: $('headline').value.trim(),
      sub: $('sub').value.trim(),
      media: media ? { kind, url: media } : undefined,
      show: showing,
    }, 'On screen within a few seconds.');
  });

  $('clear').addEventListener('click', () => {
    if (!confirm('Clear the stage back to the plain overlay?')) return;
    put({ show: showing }, 'Stage cleared.');
  });

  renderKind();
  renderPanels();
  load();
})();

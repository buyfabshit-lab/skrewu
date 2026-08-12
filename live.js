/* ============ LIVE OVERLAY ============ */
/* Add this page as a browser source in OBS or TikTok LIVE Studio and it sits  */
/* over the stream: what's for sale, how the day is going, and every order as  */
/* it lands. Background is transparent, so only the panels show.               */
/*                                                                            */
/*   live.html?shop=<slug>&k=<access key>                                     */
/*                                                                            */
/* &layout=portrait lays it out for a TikTok live — clear of the comments,    */
/* the gift bar and the button rail — and is assumed on any tall source.       */
/*                                                                            */
/* Options: &bg=1 solid background (for setting up) · &show=tally,feed,drop   */
/* &every=<seconds> how often to check (10 by default, 5 at the fastest).      */

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const p = new URLSearchParams(location.search);
  const shop = (p.get('shop') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const key = p.get('k') || '';
  const solid = p.get('bg') === '1';
  const every = Math.max(5, Number(p.get('every')) || 10) * 1000;
  const show = (p.get('show') || 'tally,feed,drop').split(',').map(s => s.trim());
  const wants = (part) => show.includes(part);

  if (solid) document.body.classList.add('solid');

  /* Wide for a desktop stream, portrait for TikTok. Nobody should have to
     remember which — a browser source that's taller than it is wide is a
     phone-shaped live, so assume that unless told otherwise. */
  const layout = ['wide', 'portrait'].includes(p.get('layout'))
    ? p.get('layout')
    : (window.innerHeight > window.innerWidth ? 'portrait' : 'wide');
  document.body.dataset.layout = layout;

  /* Anything wrong with the setup is said only on the solid background. Over a
     live stream, a broken overlay should be invisible, not an error message
     in front of an audience. */
  function trouble(msg, detail) {
    if (!solid) return;
    const el = $('help');
    el.classList.remove('off');
    el.innerHTML = `<b>${esc(msg)}</b>${esc(detail || '')}`;
  }

  if (!shop || !key) {
    trouble('Overlay not set up yet',
      'Add this as a browser source with your shop and key: live.html?shop=yourshop&k=yourkey — ' +
      'add &bg=1 while you set it up, then take it off so the background goes clear.');
    return;
  }

  const feed = $('feed');
  const seen = new Set();      // orders already shown — never announce one twice
  let first = true;
  const MAX_ON_SCREEN = 4;

  const idOf = (o) => `${o.at}|${o.who}|${o.what}`;

  function announce(o) {
    const card = document.createElement('div');
    card.className = 'ord';
    const where = o.where ? ` <span style="opacity:.75">in ${esc(o.where)}</span>` : '';
    card.innerHTML =
      `<div class="top"><b>${esc(o.who)}</b>${where}</div>` +
      `<div class="what">${esc(o.what)}${o.more ? ` +${o.more} more` : ''}` +
      `${o.units > 1 ? ` · ${o.units} pieces` : ''}</div>`;
    feed.appendChild(card);
    while (feed.children.length > MAX_ON_SCREEN) feed.removeChild(feed.firstChild);
    setTimeout(() => card.remove(), 26000);
  }

  async function tick() {
    let data;
    try {
      const res = await fetch(`/api/live?shop=${encodeURIComponent(shop)}&k=${encodeURIComponent(key)}&limit=8`,
        { cache: 'no-store' });
      data = await res.json();
      if (!data.ok) { trouble('Overlay can’t read your orders', data.error || ''); return; }
    } catch (e) {
      return;   // a dropped connection is not worth showing anybody; try again next tick
    }

    if (wants('tally')) {
      $('tally').classList.remove('off');
      $('shopName').textContent = data.shop.name || 'Shop';
      $('nOrders').textContent = data.today.orders;
      $('nUnits').textContent = data.today.units;
    }
    if (wants('drop') && data.shop.domain) {
      $('drop').classList.remove('off');
      $('dropUrl').innerHTML = `<b>${esc(data.shop.domain)}</b>`;
    }

    if (wants('feed')) {
      const fresh = (data.orders || []).filter(o => !seen.has(idOf(o)));
      fresh.forEach(o => seen.add(idOf(o)));
      // On the first read the last few orders are history, not news — bank them
      // quietly so the overlay doesn't open by announcing yesterday.
      if (!first) fresh.reverse().forEach(announce);
      first = false;
    }
  }

  // Let a theme set the colours, then start.
  (window.themeReady || Promise.resolve(null)).then(theme => {
    if (theme && theme.name) $('shopName').textContent = theme.name;
    if (wants('drop')) $('dropTitle').textContent = 'Build your own';
    tick();
    setInterval(tick, every);
  });
})();

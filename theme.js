/* ============ SKREW U · FOUR FACES, ONE ENGINE ============ */
/* Every page is built on CSS variables, so a skin is just a different set of  */
/* them plus a different set of words. Nothing about the tools changes.        */
/*                                                                            */
/* Which skin, in order:                                                      */
/*   ?theme=<id>                     — pinned in the link                     */
/*   the shop's branding.theme       — a tenant's people always land in theirs */
/*   whatever they chose last        — remembered on this device              */
/*   the default in themes.json                                               */
/*                                                                            */
/* Load this BEFORE the page's own script and await window.themeReady if you  */
/* need the words. The variables land before first paint either way.          */

window.THEME = null;

window.themeReady = (async function applyTheme() {
  const params = new URLSearchParams(location.search);
  const asked = (params.get('theme') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let remembered = '';
  try { remembered = localStorage.getItem('skrewu_theme') || ''; } catch {}

  let book;
  try {
    const res = await fetch('themes.json', { cache: 'no-store' });
    book = await res.json();
  } catch {
    return null;               // no themes file? the page's own CSS still stands
  }

  // A shop can carry its people into the right skin without a query string.
  let fromShop = '';
  const shopSlug = (params.get('shop') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!asked && shopSlug) {
    try {
      const r = await fetch('/api/shop?shop=' + encodeURIComponent(shopSlug));
      const d = await r.json();
      if (d.ok && d.shop && d.shop.theme) fromShop = String(d.shop.theme);
    } catch { /* fall through to the default */ }
  }

  const themes = book.themes || {};
  const id = [asked, fromShop, remembered, book.default]
    .find(k => k && themes[k]) || Object.keys(themes)[0];
  const theme = themes[id];
  if (!theme) return null;

  const root = document.documentElement;
  Object.entries(theme.vars || {}).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute('data-theme', id);

  /* The page backgrounds are painted with baked-in rgba glows rather than
     variables, so give the body the one this skin wants. */
  if (theme.bodyBg) {
    const s = document.createElement('style');
    s.textContent = `body{background:${theme.bodyBg} !important;}`;
    document.head.appendChild(s);
  }

  // Only remember a skin they actually asked for — not one a shop chose for them.
  if (asked) { try { localStorage.setItem('skrewu_theme', id); } catch {} }

  window.THEME = { id, ...theme };
  return window.THEME;
})();

/* Put this skin's name wherever the brand shows.
     <span data-brand="The Machine"> → "Studio · The Machine"
     <span data-brand>              → "Studio"
   and the tab title alongside it. No page owns the brand any more; every one
   of them is handed it. */
function brandThePage(theme) {
  if (!theme || !theme.name) return;
  document.querySelectorAll('[data-brand]').forEach(el => {
    const suffix = el.getAttribute('data-brand');
    el.textContent = suffix ? `${theme.name} · ${suffix}` : theme.name;
  });
  const page = document.body && document.body.getAttribute('data-page');
  if (page) document.title = `${theme.name} · ${page}`;
}
window.themeReady.then(theme => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => brandThePage(theme), { once: true });
  } else {
    brandThePage(theme);
  }
});

/* Carry the chosen skin from page to page, so somebody looking at the corporate
   face doesn't get thrown back into ours by clicking a link. */
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const asked = params.get('theme');
  if (!asked) return;
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || /^(https?:|mailto:|tel:|#)/i.test(href)) return;
    try {
      const u = new URL(href, location.href);
      if (u.origin !== location.origin) return;
      if (!u.searchParams.has('theme')) {
        u.searchParams.set('theme', asked);
        a.setAttribute('href', u.pathname + u.search + u.hash);
      }
    } catch { /* leave odd hrefs alone */ }
  });
});

/* ============ WHO'S HOLDING THE PAGE ============
 *
 * There are no accounts here. A link is the credential: ?who=<slug>&k=<key>.
 * That works well right up until a page links to another page, because the
 * second page has no idea who opened the first one and asks you to identify
 * yourself again — from a tile you just clicked while already signed in.
 *
 * So a page that knows who you are passes it on. Only to links that actually
 * need it, marked `data-keyed` by hand, because most tools don't need to know
 * who you are and a key shouldn't be sprayed across every URL on the page.
 * A link that already carries its own `who` is left exactly as it is.
 *
 * The tools don't all use the same word for it — a locker belongs to a `who`,
 * an overlay is streaming for a `shop` — so the attribute says which to write.
 * Passing the wrong name is the same as passing nothing, and it fails in the
 * quiet way where the page just looks empty.
 *
 *   <script src="session.js"></script>
 *   <a data-keyed           href="locker.html">…</a>   ?who=…&k=…
 *   <a data-keyed="shop"    href="live.html">…</a>     ?shop=…&k=…
 *   <a data-keyed="shop who" href="sticker.html">…</a> ?shop=…&who=…&k=…
 */

(function () {
  const p = new URLSearchParams(location.search);
  const who = (p.get('who') || p.get('shop') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const key = p.get('k') || '';

  window.SESSION = { who, key, signedIn: !!(who && key) };

  if (!window.SESSION.signedIn) return;

  document.querySelectorAll('a[data-keyed][href]').forEach((a) => {
    const href = a.getAttribute('href');
    // Leave anything pointing off this site alone — a key has no business
    // travelling to another host.
    if (/^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href)) return;

    const [path, query = ''] = href.split('?');
    const q = new URLSearchParams(query);
    if (q.has('who') || q.has('shop')) return;  // already addressed to somebody

    const names = (a.dataset.keyed || 'who').split(/\s+/).filter(n => n === 'who' || n === 'shop');
    (names.length ? names : ['who']).forEach(n => q.set(n, who));
    q.set('k', key);
    a.setAttribute('href', path + '?' + q.toString());
  });
})();

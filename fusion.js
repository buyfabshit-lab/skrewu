/* ============ FUSION CONTACT SHEET ============
   The list is written down rather than fetched, because reading it needs a
   hosting-account key and this page is meant to be openable by anyone holding
   the link, on a phone, without one. Deploy dates are from the account and are
   stated as of when this was written — the live shot is always current. */

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const SITES = [
    { name: '187fusion', url: 'https://187fusion.netlify.app', days: 0,
      note: 'The one that talks. Only fusion site deployed today.' },
    { name: 'midnightfusiontee', url: 'https://midnightfusiontee.netlify.app', days: 14,
      note: 'A tee shop.' },
    { name: 'toolsmidnight-fusion', url: 'https://tools.midnight-fusion.com', days: 14,
      note: 'The only one with a real domain on it.' },
    { name: 'fusion-tools', url: 'https://fusion-tools.netlify.app', days: 14,
      note: 'Same name as the one above, different site.' },
    { name: 'fusiontee', url: 'https://fusiontee.netlify.app', days: 20,
      note: 'Same name as midnightfusiontee, different site.' },
    { name: 'midnight-fusion', url: 'https://midnight-fusion.netlify.app', days: 21,
      note: 'The plain one.' },
    { name: 'fusion-command', url: 'https://fusion-command.netlify.app', days: 21,
      note: 'The only one actually called Fusion Command.' },
    { name: '187fusion-core', url: 'https://187fusion-core.netlify.app', days: 36,
      note: 'Oldest. Presumably what 187fusion grew out of.' },
    { name: 'midnight-fusion-holding', url: null, days: null,
      note: 'Never deployed — an empty site record.' },
    { name: 'midnight-fusion-site', url: null, days: null,
      note: 'Never deployed — an empty site record.' },
  ];

  const colourFor = (d) => d === null ? 'var(--iron-2)' : (d === 0 ? 'var(--acid)' : 'var(--ember)');
  const ageFor = (d) => d === null ? 'never' : (d === 0 ? 'today' : d + 'd ago');

  $('grid').innerHTML = SITES.map(s => `
    <div class="card${s.days === 0 ? ' live' : ''}${s.url ? '' : ' dead'}">
      <div class="head">
        <span class="dot" style="background:${colourFor(s.days)}"></span>
        <h3>${esc(s.name)}</h3>
        <span class="age">${esc(ageFor(s.days))}</span>
      </div>
      <div class="shot">
        ${s.url
          ? `<iframe src="${esc(s.url)}" loading="lazy" referrerpolicy="no-referrer"
                     sandbox="allow-scripts allow-same-origin" title="${esc(s.name)}"></iframe>
             <span class="veil"></span>`
          : `<span class="none">Nothing deployed<br/>— nothing to show</span>`}
      </div>
      <div class="foot">
        <span class="url">${esc(s.url ? s.url.replace(/^https:\/\//, '') : '—')}</span>
        ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Open</a>` : ''}
      </div>
      <div class="note">${esc(s.note)}</div>
    </div>`).join('');
})();

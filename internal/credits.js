/* ============ CREDITS ============ */
/* What a shop has, what a run costs, and buying more.                        */
/*                                                                            */
/*   credits.html?who=<slug>&k=<access key>                                   */
/*                                                                            */
/* Prices come from the server, which reads them from the database — the page */
/* never states a price of its own, so what it quotes and what gets charged   */
/* are the same number by construction.                                       */

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const p = new URLSearchParams(location.search);
  const who = (p.get('who') || p.get('shop') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const key = p.get('k') || '';
  const bought = p.get('bought');

  const n = (v) => Number(v).toLocaleString('en-US');
  const money = (cents) => '$' + (Number(cents) / 100).toLocaleString('en-US',
    { minimumFractionDigits: Number(cents) % 100 ? 2 : 0, maximumFractionDigits: 2 });

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
  }

  const api = `/api/credits?who=${encodeURIComponent(who)}&k=${encodeURIComponent(key)}`;

  /* A run's price, said in the words the tools use. */
  function drawRates(prices) {
    const rows = [
      ['Image', prices.image['1K'], 'each, 1K'],
      ['Image', prices.image['2K'], 'each, 2K'],
      ['Video', prices.video['5'], '5 seconds'],
      ['Video', prices.video['10'], '10 seconds'],
    ];
    $('rates').innerHTML = rows.map(([what, cost, note]) =>
      `<div class="rate"><div class="n">${n(cost)}</div>
        <div class="w">${esc(what)} · ${esc(note)}</div></div>`).join('');
  }

  function drawPacks(packs, canBuy) {
    if (!packs.length) { $('packs').innerHTML = ''; return; }
    const best = packs.reduce((a, b) => (Number(b.savings_pct) > Number(a.savings_pct) ? b : a), packs[0]);
    $('packs').innerHTML = packs.map(k => `
      <div class="pack${k.id === best.id && Number(best.savings_pct) > 0 ? ' best' : ''}">
        ${Number(k.savings_pct) > 0 ? `<span class="save">Save ${k.savings_pct}%</span>` : ''}
        <div class="cr">${n(k.credits)}<small>credits</small></div>
        <div class="amt">${money(k.price)}</div>
        <div class="per">${(k.price / k.credits).toFixed(2)}¢ each</div>
        <button data-pack="${esc(k.id)}" type="button"${canBuy ? '' : ' disabled'}>
          ${canBuy ? 'Buy' : 'Not connected'}</button>
      </div>`).join('');

    $('packs').querySelectorAll('[data-pack]').forEach(b => b.addEventListener('click', async () => {
      const was = b.textContent; b.disabled = true; b.textContent = 'One sec…';
      try {
        const res = await fetch(api, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pack: b.dataset.pack }),
        });
        const d = await res.json();
        if (d.ok && d.url) { location.href = d.url; return; }
        toast(d.error || 'Could not start checkout.');
      } catch (e) {
        toast('Could not reach checkout: ' + e.message);
      } finally { b.disabled = false; b.textContent = was; }
    }));
  }

  function drawLedger(rows) {
    if (!rows || !rows.length) {
      $('ledger').innerHTML = '<div class="empty">Nothing yet — buy a pack and it starts here.</div>';
      return;
    }
    $('ledger').innerHTML = rows.map(r => {
      const up = Number(r.amount) > 0;
      const when = new Date(r.created_at).toLocaleDateString('en-US',
        { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return `<div class="r">
        <span class="a ${up ? 'pos' : 'neg'}">${up ? '+' : ''}${n(r.amount)}</span>
        <span class="d">${esc(r.description || '')}</span>
        <span class="t">${esc(r.type)} · ${esc(when)}</span>
        <span class="t">${n(r.balance_after)} left</span>
      </div>`;
    }).join('');
  }

  async function load() {
    if (!who || !key) {
      $('shopName').textContent = 'Not connected';
      $('balance').textContent = '—';
      $('note').textContent = 'Open this from your own link — credits.html?who=you&k=yourkey';
      $('note').classList.add('bad');
      $('ledger').innerHTML = '<div class="empty">Not connected.</div>';
      return;
    }
    let d;
    try {
      const res = await fetch(api, { cache: 'no-store' });
      d = await res.json();
    } catch (e) {
      $('note').textContent = 'Could not reach the server: ' + e.message;
      $('note').classList.add('bad');
      return;
    }
    if (!d.ok) {
      $('shopName').textContent = 'Not connected';
      $('note').textContent = d.error || 'Could not load.';
      $('note').classList.add('bad');
      $('ledger').innerHTML = `<div class="empty">${esc(d.error || 'Could not load.')}</div>`;
      return;
    }

    $('balance').textContent = n(d.balance);
    $('shopName').textContent = d.shop.name;
    $('usedLine').textContent = d.used ? `${n(d.used)} spent so far` : 'nothing spent yet';
    // Enough for a 5-second clip is the line between "fine" and "top up".
    $('bal').classList.toggle('low', d.balance < d.prices.video['5']);

    drawRates(d.prices);
    drawPacks(d.packs, d.canBuy);
    drawLedger(d.ledger);

    if (!d.canBuy) {
      $('note').textContent = 'Card payments aren’t connected yet — a STRIPE_SECRET_KEY in Netlify switches this on.';
    }
  }

  /* Coming back from Stripe. The credits are added by the webhook when Stripe
     confirms the money, so the balance may land a second or two after the
     page does — say so honestly and refresh rather than claiming a number. */
  async function landed() {
    if (!bought) return;
    history.replaceState(null, '', `credits.html?who=${encodeURIComponent(who)}&k=${encodeURIComponent(key)}`);
    $('paidNote').innerHTML = `
      <div class="paid"><div class="m">✓</div>
        <div><h3>Payment received</h3>
        <p id="paidSub">Your credits are landing now — this'll update in a moment.</p></div></div>`;

    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const before = $('balance').textContent;
      await load();
      if ($('balance').textContent !== before && $('balance').textContent !== '—') {
        const sub = $('paidSub');
        if (sub) sub.textContent = 'Credits are in. Go make something.';
        return;
      }
    }
    const sub = $('paidSub');
    if (sub) sub.textContent = 'Taking longer than usual. Your payment went through — reload in a minute.';
  }

  load().then(landed);
})();

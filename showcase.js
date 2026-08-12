/* ============ THE FULL SHOW · one tool per sheet ============ */
/* Copy and prices come from products.json — the same catalog the store and  */
/* the checkout sell from, so the show can never disagree with the till.     */
/*                                                                           */
/* The action shots are not photographs. Every tool here is made of shapes — */
/* sheets, lockers, order rows, wires — so each vignette is the tool's own   */
/* shapes performing, drawn live in HTML. No screenshots to go stale, and    */
/* they re-colour themselves when a face changes the palette.                */

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = (n) => '$' + Number(n).toLocaleString('en-US');

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
  }

  /* Each sheet gets its own accent so the reel reads as chapters, not a loop. */
  const ACCENTS = ['#c4f135', '#ff8a3d', '#7f95b0', '#c4f135', '#ff8a3d', '#c4f135'];

  /* ---------- the action shots ---------- */

  const SHOTS = {
    'logo-maker': `
      <div style="display:flex;align-items:center;gap:18px;">
        <div style="width:120px;height:120px;border:1px solid var(--iron-2);position:relative;overflow:hidden;
             background:linear-gradient(135deg,#2a2620,#1a1712);">
          <div style="position:absolute;inset:0;background:
            radial-gradient(40px 30px at 30% 40%, rgba(216,64,47,.4), transparent 70%),
            radial-gradient(50px 40px at 70% 65%, rgba(127,149,176,.3), transparent 70%);"></div>
          <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
             font-size:52px;filter:blur(.6px);opacity:.85;">☠</span>
          <span style="position:absolute;left:8px;top:6px;font-size:8px;letter-spacing:.14em;color:#7a7264;">BEFORE</span>
        </div>
        <div style="font-size:22px;color:var(--acc);">→</div>
        <div style="width:120px;height:120px;border:1px solid var(--acc);position:relative;
             background:repeating-conic-gradient(#1d1a15 0 25%, #26221b 0 50%) 0 0/16px 16px;">
          <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
             font-size:52px;">☠</span>
          <span style="position:absolute;left:8px;top:6px;font-size:8px;letter-spacing:.14em;color:var(--acc);">PRINT PNG</span>
        </div>
      </div>`,

    'gang-sheet': `
      <div style="width:200px;border:1px solid var(--iron-2);background:#0e0c09;padding:8px;position:relative;">
        <div style="position:absolute;left:-1px;top:-14px;right:-1px;display:flex;justify-content:space-between;
             font-size:8px;color:#7a7264;letter-spacing:.1em;"><span>0"</span><span>22"</span></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
          ${[38, 38, 38, 38, 54, 26, 26, 54, 30, 44, 44, 30].map((h, i) =>
            `<div style="height:${h}px;border:1px solid ${i % 3 ? 'var(--iron-2)' : 'var(--acc)'};
              background:linear-gradient(180deg,#1b1813,#12100c);"></div>`).join('')}
        </div>
        <div style="margin-top:8px;text-align:center;font-size:8.5px;letter-spacing:.16em;color:var(--acc);">
          91% OF THE SHEET USED · 300 DPI</div>
      </div>`,

    'locker': `
      <div style="display:flex;flex-direction:column;gap:9px;width:230px;">
        ${[['RORION', 10, 1], ['OCEANAIRE', 7, 0], ['JORGE', 3, 0]].map(([nm, n, hot]) => `
          <div style="display:flex;align-items:center;gap:10px;border:1px solid ${hot ? 'var(--acc)' : 'var(--iron-2)'};
               padding:10px 12px;background:#12100c;">
            <span style="width:8px;height:8px;border-radius:50%;background:${hot ? 'var(--acc)' : '#4b453d'};"></span>
            <span style="font-family:var(--disp);letter-spacing:.1em;font-size:13px;">${nm}</span>
            <span style="margin-left:auto;font-size:9px;color:#7a7264;letter-spacing:.1em;">${n} LOGOS</span>
            <span style="font-size:9px;color:${hot ? 'var(--acc)' : '#4b453d'};">⚿</span>
          </div>`).join('')}
        <div style="text-align:center;font-size:8.5px;letter-spacing:.16em;color:#7a7264;">
          EACH LINK OPENS ONE ROOM AND NO OTHERS</div>
      </div>`,

    'omniflow': `
      <div style="width:250px;border:1px solid var(--iron-2);background:#0e0c09;">
        <div style="display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--iron-2);
             font-size:8.5px;letter-spacing:.14em;color:#7a7264;"><span>TODAY</span><span style="color:var(--acc)">24 ORDERS</span></div>
        ${[['#1042', 'STICKERS 12×24', 'DTC', 'var(--acc)'], ['#1041', '24 × TEES', 'B2B', '#ff8a3d'],
           ['#1040', 'HOODIE RUSH', 'EXPEDITE', '#d8402f'], ['#1039', 'GANG SHEET', 'DTC', 'var(--acc)']]
          .map(([no, what, cls, col], i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #16130f;
               animation:srow .5s ${i * .12}s both;">
            <span style="font-size:10px;color:#7a7264;">${no}</span>
            <span style="font-size:10px;flex:1;">${what}</span>
            <span style="font-size:8px;letter-spacing:.1em;color:${col};border:1px solid currentColor;padding:2px 5px;">${cls}</span>
          </div>`).join('')}
      </div>
      <style>@keyframes srow{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}</style>`,

    'all-access': `
      <div style="display:flex;flex-direction:column;align-items:center;gap:16px;">
        <div style="display:flex;align-items:center;gap:0;">
          ${['ART', 'SHEET', 'SHOP', 'ORDER', 'SHIP'].map((nm, i, a) => `
            <div style="display:flex;align-items:center;">
              <div style="border:1px solid var(--acc);background:#141709;padding:9px 8px;text-align:center;">
                <span style="display:block;width:7px;height:7px;border-radius:50%;background:var(--acc);margin:0 auto 5px;
                  box-shadow:0 0 8px var(--acc);"></span>
                <span style="font-size:8px;letter-spacing:.12em;color:var(--bone);">${nm}</span>
              </div>
              ${i < a.length - 1 ? `<span style="width:16px;height:1.5px;background:var(--acc);opacity:.7;"></span>` : ''}
            </div>`).join('')}
        </div>
        <div style="text-align:center;font-size:8.5px;letter-spacing:.16em;color:var(--acc);">
          EVERY PART LIT · AND EVERY PART WE ADD</div>
      </div>`,

    'shop-kit': `
      <div style="text-align:center;">
        <div style="border:1px solid var(--iron-2);background:#12100c;padding:16px 26px;display:inline-block;">
          <div style="font-size:8.5px;letter-spacing:.2em;color:#7a7264;">THE NAME ON THE DOOR</div>
          <div style="font-family:var(--disp);font-size:26px;letter-spacing:.06em;margin-top:6px;">YOUR SHOP</div>
          <div style="display:flex;gap:7px;justify-content:center;margin-top:12px;">
            ${['#c4f135', '#1d6fe0', '#ffd400', '#ffc247', '#2e9e6b'].map(c =>
              `<span style="width:14px;height:14px;border-radius:50%;background:${c};border:1px solid #0a0908;"></span>`).join('')}
          </div>
          <div style="font-size:8px;letter-spacing:.14em;color:#7a7264;margin-top:8px;">FIVE FACES · SAME ENGINE</div>
        </div>
      </div>`,
  };

  const fallbackShot = `<div style="font-size:40px;color:var(--acc);">▣</div>`;

  /* ---------- build the reel ---------- */

  let ready = null;

  async function build() {
    let cat;
    try {
      const res = await fetch('products.json', { cache: 'no-store' });
      cat = await res.json();
    } catch {
      $('reel').innerHTML = '<p style="padding:120px 22px;color:var(--bone-dim)">Could not load the catalog.</p>';
      return;
    }

    const items = cat.products || [];
    $('reel').innerHTML = items.map((p, i) => {
      const acc = ACCENTS[i % ACCENTS.length];
      return `
      <section class="sheet" id="s-${esc(p.id)}" style="--acc:${acc};--tint:${acc}12;">
        <div class="glow"></div>
        <div class="in">
          <div class="copy">
            <div class="stage"><span class="n">${String(i + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}</span>
              ${p.badge ? `<span class="b">${esc(p.badge)}</span>` : ''}</div>
            <h2>${esc(p.name).replace(/ (\S+)$/, ' <em>$1</em>')}</h2>
            <p class="tag">${esc(p.blurb || p.tagline || '')}</p>
            <ul>${(p.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
            <div class="deal">
              <div class="price">${money(p.price)}<small>${esc(p.billing || '')}</small></div>
              <div class="acts">
                <button class="btn buy" data-id="${esc(p.id)}" type="button">Buy</button>
                ${p.demo ? `<a class="btn" href="${esc(p.demo)}">Try it</a>` : ''}
              </div>
            </div>
          </div>
          <div class="shot">${SHOTS[p.id] || fallbackShot}
            <span class="cap">${esc(p.tagline || '')}</span></div>
        </div>
      </section>`;
    }).join('');

    /* buying — the same checkout the store uses */
    $('reel').querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', async () => {
      const p = items.find(x => x.id === btn.dataset.id);
      if (!p) return;
      if (p.paymentLink) { location.href = p.paymentLink; return; }
      const was = btn.textContent; btn.disabled = true; btn.textContent = 'One sec…';
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id }),
        });
        const d = await res.json();
        if (d.ok && d.url) { location.href = d.url; return; }
        toast(d.error || 'Checkout isn’t connected yet.');
      } catch (e) {
        toast('Could not reach checkout: ' + e.message);
      } finally { btn.disabled = false; btn.textContent = was; }
    }));

    /* the rail — one dot per sheet, lit where you are */
    const sheets = [...document.querySelectorAll('.sheet, .hero, .fin')];
    $('rail').innerHTML = sheets.map((s, i) =>
      `<button type="button" data-i="${i}" aria-label="Sheet ${i + 1}"></button>`).join('');
    const dots = [...$('rail').children];
    dots.forEach((d, i) => d.addEventListener('click', () => sheets[i].scrollIntoView({ behavior: 'smooth' })));
    const seen = new IntersectionObserver((es) => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        const i = sheets.indexOf(e.target);
        dots.forEach((d, j) => d.classList.toggle('on', j === i));
      });
    }, { threshold: 0.55 });
    sheets.forEach(s => seen.observe(s));
  }

  build();
})();

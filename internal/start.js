/* ============ SKREW U · START ============ */
/* The plain version of the way in, for anyone who'd rather not be talked to. */
/* The routes themselves live in starters.js, shared with the intro.          */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function render() {
  $('picks').innerHTML = STARTERS.map(s => `
    <button class="pick" data-s="${esc(s.id)}" type="button">
      <h3>${esc(s.name)}</h3>
      <div class="say">${esc(s.say)}</div>
      <div class="line">
        ${s.steps.map((st, i) => `<span class="stp">${i ? '<span class="ar">→</span>' : ''}<span class="st">${esc(st)}</span></span>`).join('')}
      </div>
      <div class="go">Build it for me →</div>
    </button>`).join('');

  $('picks').querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
    useStarter(STARTERS.find(s => s.id === b.dataset.s));
  }));
}

$('all').addEventListener('click', (e) => { e.preventDefault(); useEverything(); });

render();

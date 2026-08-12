/* ============ SKREW U · THE WAY IN ============ */
/* She explains the place in about twenty seconds, typed or spoken — their     */
/* choice — then steps out of the way and lets them pick a road. Every road    */
/* ends at the same door, and nothing is switched off at the start.            */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* Short lines. Somebody standing in a shop with their phone out reads these,
   and every one of them is a true thing about the software. */
const SCRIPT = [
  "Alright — this'll take twenty seconds.",
  'Everything you make runs down one line. Art in one end, a boxed order out the other.',
  "It's all open. Every tool, right now. Nothing locked, nothing to unlock.",
  'You choose the way through — gang sheets, shirts, stickers, or just the orders.',
  'Any of them. They all come out the same end.',
  "And it's never stuck. Add a part, move one, throw one out. The line is yours.",
];

const face = $('face');
const said = $('said');
let mode = 'type';          // 'type' | 'say'
let running = false;
let stop = false;

const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
if (!canSpeak) $('mSay').style.display = 'none';

const talking = (on) => face.classList.toggle('talking', !!on);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* Prefer a woman's voice when the device has one — she reads better with the
   copy — but never refuse to speak just because the naming is unfamiliar. */
function pickVoice() {
  const all = speechSynthesis.getVoices() || [];
  if (!all.length) return null;
  const en = all.filter(v => /^en/i.test(v.lang || ''));
  const pool = en.length ? en : all;
  const named = pool.find(v => /female|samantha|victoria|karen|moira|tessa|serena|zira|aria|jenny/i.test(v.name || ''));
  return named || pool[0];
}
function voicesReady() {
  if (!canSpeak) return Promise.resolve();
  if ((speechSynthesis.getVoices() || []).length) return Promise.resolve();
  return new Promise(res => {
    let done = false;
    const go = () => { if (!done) { done = true; res(); } };
    speechSynthesis.addEventListener('voiceschanged', go, { once: true });
    setTimeout(go, 1200);   // some browsers never fire it
  });
}

function show(finished, current) {
  said.innerHTML =
    (finished ? `<span class="done">${esc(finished)}</span><br>` : '') +
    `<span class="now">${esc(current)}</span><span class="cur">&nbsp;</span>`;
}

async function typeLine(line, previous) {
  talking(true);
  for (let i = 1; i <= line.length; i++) {
    if (stop) break;
    show(previous, line.slice(0, i));
    // a beat at punctuation reads like breathing instead of a ticker
    await sleep(/[.,—]/.test(line[i - 1]) ? 130 : 21);
  }
  talking(false);
}

function speakLine(line) {
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(line);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 1.02; u.pitch = 1.03;
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    u.onend = done;
    u.onerror = done;
    // If speech silently fails, don't strand them staring at a still face.
    setTimeout(done, Math.max(3500, line.length * 95));
    speechSynthesis.speak(u);
  });
}

async function play() {
  if (running) return;
  running = true; stop = false;
  let previous = '';
  for (const line of SCRIPT) {
    if (stop) break;
    if (mode === 'say' && canSpeak) {
      show(previous, line);
      talking(true);
      await speakLine(line);
      talking(false);
    } else {
      await typeLine(line, previous);
    }
    if (stop) break;
    previous = line;
    await sleep(420);
  }
  running = false;
  if (!stop) finish();
}

function finish() {
  talking(false);
  said.innerHTML = `<span class="done">${esc(SCRIPT[SCRIPT.length - 1])}</span>`;
  $('fork').classList.add('in');
  $('skip').textContent = 'Start over';
}

function skip() {
  stop = true; running = false;
  if (canSpeak) { try { speechSynthesis.cancel(); } catch {} }
  if ($('fork').classList.contains('in')) {   // second press: run it again
    $('fork').classList.remove('in');
    $('skip').textContent = 'Skip →';
    setTimeout(() => { stop = false; play(); }, 120);
    return;
  }
  finish();
}

function renderWays() {
  $('ways').innerHTML = STARTERS.map(s => `
    <button class="way" data-s="${esc(s.id)}" type="button">
      <h3>${esc(s.name)}</h3>
      <div class="s">${esc(s.say)}</div>
      <div class="go">Build it for me →</div>
    </button>`).join('');
  $('ways').querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => {
    if (canSpeak) { try { speechSynthesis.cancel(); } catch {} }
    useStarter(STARTERS.find(s => s.id === b.dataset.s));
  }));
}

/* Switching how she talks restarts her, so you actually hear the change. */
function setMode(m) {
  mode = m;
  $('mType').classList.toggle('on', m === 'type');
  $('mSay').classList.toggle('on', m === 'say');
  stop = true;
  if (canSpeak) { try { speechSynthesis.cancel(); } catch {} }
  $('fork').classList.remove('in');
  $('skip').textContent = 'Skip →';
  setTimeout(async () => {
    stop = false; running = false;
    if (m === 'say') await voicesReady();
    play();
  }, 140);
}

$('mType').addEventListener('click', () => setMode('type'));
$('mSay').addEventListener('click', () => setMode('say'));
$('skip').addEventListener('click', skip);
// Speech gets cut off by leaving the page in some browsers; be tidy about it.
window.addEventListener('pagehide', () => { if (canSpeak) { try { speechSynthesis.cancel(); } catch {} } });

renderWays();
play();

/* ============ BLANK NORMALIZER ============ */
/* Turns "cut it out and make it as big as I can with a border" into something  */
/* a machine repeats identically every time.                                    */
/*                                                                              */
/* The idea that makes it work: the canvas is a fixed piece of the real world —  */
/* say 26 inches wide. Every garment is drawn into it at its TRUE width, so a    */
/* 22" men's large fills more of the frame than an 18" women's medium, exactly  */
/* as it should. The margin isn't a setting anyone tunes; it falls out of the    */
/* difference between the garment and the canvas.                               */
/*                                                                              */
/* That gives one pixels-per-inch for every blank in the library, which is what  */
/* lets a print placed once land correctly on all of them.                       */

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /* The number that sets the scale is the garment's WIDEST point as it lies in
     the photo — sleeve hem to sleeve hem — because that is exactly what the
     cut-out's width is. A spec sheet's "chest width" is measured an inch below
     the armhole and is a little narrower, so it is not the same number. These
     are starting points; measure the actual style. */
  const TYPICAL = { mens: 23, womens: 19 };

  let fit = 'mens';
  let items = [];   // {name, canvas, ppi, garmentW, tight}

  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  const refSize = () => (fit === 'womens' ? 'M' : 'L');

  /* ---- find the garment inside the picture ----
     Walk in from each edge until a pixel is actually part of the shirt, so the
     photo's own empty space is ignored and the scale is measured off the
     garment rather than off whatever the photographer left around it. */
  function bounds(data, w, h, knockout) {
    const solid = (i) => {
      const a = data[i + 3];
      if (a < 24) return false;                    // transparent
      if (!knockout) return true;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      return !(r > 243 && g > 243 && b > 243);     // near-white counts as background
    };
    let top = -1, left = w, right = -1, bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!solid((y * w + x) * 4)) continue;
        if (top < 0) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    if (top < 0) return null;
    return { left, top, right, bottom, w: right - left + 1, h: bottom - top + 1 };
  }

  /* Optional: drop a plain white background to transparent. Deliberately
     conservative — it only clears near-white, so it won't eat a light grey
     heather or the highlight on a shoulder. */
  function knockWhiteOut(data) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 243 && data[i + 1] > 243 && data[i + 2] > 243) data[i + 3] = 0;
    }
  }

  async function process(file) {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('could not read ' + file.name));
      im.src = URL.createObjectURL(file);
    });

    const knockout = $('knockout').checked;
    const src = document.createElement('canvas');
    src.width = img.naturalWidth; src.height = img.naturalHeight;
    const sctx = src.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(img.src);

    const id = sctx.getImageData(0, 0, src.width, src.height);
    if (knockout) { knockWhiteOut(id.data); sctx.putImageData(id, 0, 0); }

    const b = bounds(id.data, src.width, src.height, knockout);
    if (!b) throw new Error(file.name + ' looks empty');

    // Did the original already run to the edge? Worth saying out loud.
    const tight = b.left <= 1 || b.top <= 1 ||
                  b.right >= src.width - 2 || b.bottom >= src.height - 2;

    const canvasIn = Math.max(1, Number($('canvasIn').value) || 26);
    const canvasPx = Math.max(200, Number($('canvasPx').value) || 2000);
    const wideIn = Math.max(1, Number($('chestIn').value) || TYPICAL[fit]);

    // The cut-out's width IS the garment's widest point, so it maps straight
    // across — no doubling. Getting this wrong scales every blank wrong.
    const ppi = canvasPx / canvasIn;
    let targetW = Math.round(wideIn * ppi);

    // A garment wider than the canvas would run off the edge, which is the
    // whole thing we're here to stop. Say so rather than quietly cropping.
    const maxW = Math.round(canvasPx * 0.92);
    let tooWide = false;
    if (targetW > maxW) { targetW = maxW; tooWide = true; }

    const scale = targetW / b.w;
    const targetH = Math.round(b.h * scale);

    const out = document.createElement('canvas');
    out.width = canvasPx; out.height = canvasPx;
    const octx = out.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, b.left, b.top, b.w, b.h,
      Math.round((canvasPx - targetW) / 2), Math.round((canvasPx - targetH) / 2),
      targetW, targetH);

    return {
      name: file.name.replace(/\.[^.]+$/, ''),
      canvas: out, ppi, tight, tooWide, canvasIn,
      garmentIn: (targetW / ppi),
      fills: Math.round((targetW / canvasPx) * 100),
      spare: ((canvasIn - targetW / ppi) / 2),
    };
  }

  function render() {
    const out = $('out');
    if (!items.length) { out.innerHTML = '<div class="empty">Nothing yet — drop some shirt photos in.</div>'; return; }
    out.innerHTML = '';
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `
        <div class="frame"></div>
        <div class="meta">
          <b>${esc(it.name)}</b><br>
          ${it.garmentIn.toFixed(1)}" across · ${it.spare.toFixed(1)}" clear each side<br>
          ${Math.round(it.ppi)} pixels per inch · fills ${it.fills}%
          ${it.tight ? '<br><span class="warn">the original ran to the edge — fixed here</span>' : ''}
          ${it.tooWide ? `<br><span class="warn">wider than a ${it.canvasIn}" canvas — widen the canvas or check the measurement</span>` : ''}
        </div>
        <button class="dl" data-i="${i}" type="button">Save PNG</button>`;
      const frame = el.querySelector('.frame');
      frame.appendChild(it.canvas);
      out.appendChild(el);
    });

    out.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
      const it = items[Number(b.dataset.i)];
      it.canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${it.name}-${refSize()}-${Math.round(it.ppi)}ppi.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 'image/png');
    }));
  }

  async function take(files) {
    const list = [...files].filter(f => /^image\//.test(f.type));
    if (!list.length) { toast('Pick image files', true); return; }
    for (const f of list) {
      try { items.push(await process(f)); }
      catch (e) { toast(e.message, true); }
    }
    render();
    toast(`${list.length} normalised — same frame, same scale`);
  }

  $('drop').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', e => { take(e.target.files); e.target.value = ''; });
  ['dragenter','dragover'].forEach(ev => $('drop').addEventListener(ev, e => {
    e.preventDefault(); $('drop').classList.add('over');
  }));
  ['dragleave','drop'].forEach(ev => $('drop').addEventListener(ev, e => {
    e.preventDefault(); $('drop').classList.remove('over');
  }));
  $('drop').addEventListener('drop', e => { if (e.dataTransfer) take(e.dataTransfer.files); });
  $('clear').addEventListener('click', () => { items = []; render(); });

  $('fit').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
    fit = b.dataset.f;
    $('fit').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    $('chestIn').value = TYPICAL[fit];
  }));

  render();
})();

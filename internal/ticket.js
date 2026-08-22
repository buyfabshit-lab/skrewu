/* ============================================================
   NEVER BLANK — Print Ticket + CAD Sheet Generator
   ------------------------------------------------------------
   Turns a won/bought SKREWBAY listing into a shop-floor
   production packet:
     Page 1 — PRINT TICKET  (work order for the press)
     Page 2 — CAD SHEET     (art placement + imprint spec)

   The whole point of the codename: a garment must NEVER reach
   the press blank. If a listing has no artwork, the packet is
   stamped "NO ART — DO NOT PRINT" so the job is held instead of
   run empty.

   Exposes: window.NeverBlank.generatePacket(order)
   No backend / build step — pops a print-ready window.
   ============================================================ */
(function (global) {
  'use strict';

  // Standard adult front imprint envelope (inches).
  var MAX_IMPRINT_W = 12;
  var MAX_IMPRINT_H = 14;
  // Standard top-of-print drop from collar seam (inches).
  var COLLAR_DROP = 3.5;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(n) {
    var v = Number(n);
    return isFinite(v) ? '$' + v.toFixed(2) : '—';
  }

  // Short, deterministic order number from the listing id + date.
  function orderNumber(order) {
    var seed = String(order.id || order.title || 'JOB');
    var h = 0;
    for (var i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) >>> 0; }
    var tag = ('000000' + (h % 1000000)).slice(-6);
    var d = order.date instanceof Date ? order.date : new Date(order.date || Date.now());
    var ymd = d.getFullYear().toString().slice(-2) +
      ('0' + (d.getMonth() + 1)).slice(-2) +
      ('0' + d.getDate()).slice(-2);
    return 'SKU-' + ymd + '-' + tag;
  }

  // Load an image just to read its natural aspect ratio (w/h).
  // Resolves to null if there is no art or it fails to load.
  function measureArt(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve(null); return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var done = false;
      var finish = function (val) { if (!done) { done = true; resolve(val); } };
      img.onload = function () {
        var r = img.naturalWidth && img.naturalHeight
          ? img.naturalWidth / img.naturalHeight : 1;
        finish(isFinite(r) && r > 0 ? r : 1);
      };
      img.onerror = function () { finish(1); }; // art exists but couldn't measure — assume square
      // Guard against a hung load.
      setTimeout(function () { finish(1); }, 4000);
      img.src = url;
    });
  }

  // Fit artwork into the imprint envelope, preserving aspect ratio.
  function fitImprint(aspect) {
    var r = aspect && aspect > 0 ? aspect : 1;
    var w = MAX_IMPRINT_H * r; // width if we max out height
    var h, pw;
    if (w <= MAX_IMPRINT_W) { h = MAX_IMPRINT_H; pw = w; }
    else { pw = MAX_IMPRINT_W; h = MAX_IMPRINT_W / r; }
    return {
      w: Math.round(pw * 10) / 10,
      h: Math.round(h * 10) / 10
    };
  }

  function checkbox(label) {
    return '<span class="cbx"><span class="box"></span>' + esc(label) + '</span>';
  }

  /* ---- CAD SHEET (SVG art-placement diagram) ---- */
  function cadSvg(order, aspect) {
    var SCALE = 22;                 // px per inch
    var artUrl = order.artworkUrl;
    var hasArt = !!artUrl;
    var dims = fitImprint(aspect);

    // Drawing space: 18in wide x 22in tall garment front.
    var GW = 18, GH = 22;
    var W = GW * SCALE, H = GH * SCALE;

    // Imprint envelope, centered horizontally, dropped from collar.
    var envW = MAX_IMPRINT_W * SCALE, envH = MAX_IMPRINT_H * SCALE;
    var envX = (W - envW) / 2;
    var envY = (COLLAR_DROP + 1.2) * SCALE; // +collar band

    // Actual artwork box (centered in the envelope, top-aligned to drop line).
    var artW = dims.w * SCALE, artH = dims.h * SCALE;
    var artX = (W - artW) / 2;
    var artY = envY;

    // Simple tee silhouette path.
    var neck = 2.4 * SCALE, shoulder = 1.6 * SCALE, sleeve = 3 * SCALE;
    var cx = W / 2;
    var body =
      'M ' + (cx - neck) + ' ' + (0.6 * SCALE) +
      ' C ' + (cx - neck * 0.4) + ' ' + (1.9 * SCALE) + ' ' + (cx + neck * 0.4) + ' ' + (1.9 * SCALE) + ' ' + (cx + neck) + ' ' + (0.6 * SCALE) +
      ' L ' + (cx + neck + shoulder) + ' ' + (0.2 * SCALE) +
      ' L ' + (W - 0.5 * SCALE) + ' ' + (3.2 * SCALE) +
      ' L ' + (W - 2.2 * SCALE) + ' ' + (5.4 * SCALE) +
      ' L ' + (W - 3.4 * SCALE) + ' ' + (4.6 * SCALE) +
      ' L ' + (W - 3.4 * SCALE) + ' ' + (GH * SCALE - 0.4 * SCALE) +
      ' L ' + (3.4 * SCALE) + ' ' + (GH * SCALE - 0.4 * SCALE) +
      ' L ' + (3.4 * SCALE) + ' ' + (4.6 * SCALE) +
      ' L ' + (2.2 * SCALE) + ' ' + (5.4 * SCALE) +
      ' L ' + (0.5 * SCALE) + ' ' + (3.2 * SCALE) +
      ' L ' + (cx - neck - shoulder) + ' ' + (0.2 * SCALE) +
      ' Z';

    // Registration crosshair at a point.
    function cross(x, y) {
      var s = 7;
      return '<g stroke="#a32a1f" stroke-width="1">' +
        '<line x1="' + (x - s) + '" y1="' + y + '" x2="' + (x + s) + '" y2="' + y + '"/>' +
        '<line x1="' + x + '" y1="' + (y - s) + '" x2="' + x + '" y2="' + (y + s) + '"/>' +
        '</g>';
    }

    var artLayer;
    if (hasArt) {
      artLayer =
        '<image href="' + esc(artUrl) + '" x="' + artX + '" y="' + artY +
        '" width="' + artW + '" height="' + artH + '" preserveAspectRatio="xMidYMid meet"/>' +
        cross(artX, artY) + cross(artX + artW, artY) +
        cross(artX, artY + artH) + cross(artX + artW, artY + artH);
    } else {
      artLayer =
        '<rect x="' + artX + '" y="' + envY + '" width="' + envW + '" height="' + envH +
        '" fill="#fff4f2" stroke="#a32a1f" stroke-width="2" stroke-dasharray="8 5"/>' +
        '<text x="' + cx + '" y="' + (envY + envH / 2) +
        '" text-anchor="middle" fill="#a32a1f" font-size="20" font-weight="700" ' +
        'font-family="Arial Narrow, sans-serif">NO ART SUPPLIED</text>';
    }

    return '' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" xmlns="http://www.w3.org/2000/svg" ' +
      'font-family="Courier New, monospace">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#faf7ef"/>' +
      // grid
      gridLines(W, H, SCALE) +
      '<path d="' + body + '" fill="#ffffff" stroke="#1a1815" stroke-width="1.5"/>' +
      // imprint envelope
      '<rect x="' + envX + '" y="' + envY + '" width="' + envW + '" height="' + envH +
      '" fill="none" stroke="#3a3530" stroke-width="1" stroke-dasharray="4 4"/>' +
      '<text x="' + (envX + 3) + '" y="' + (envY - 4) + '" font-size="9" fill="#56504a">' +
      'MAX IMPRINT ' + MAX_IMPRINT_W + '&#215;' + MAX_IMPRINT_H + ' in</text>' +
      // collar drop line
      '<line x1="' + envX + '" y1="' + envY + '" x2="' + (envX - 18) + '" y2="' + envY +
      '" stroke="#a32a1f" stroke-width="1"/>' +
      '<text x="' + (envX - 22) + '" y="' + (envY + 3) + '" text-anchor="end" font-size="9" ' +
      'fill="#a32a1f">' + COLLAR_DROP + '&#8243; drop</text>' +
      artLayer +
      // width dimension
      dimH(artX, artX + artW, artY - 16, hasArt ? dims.w + '&#8243;' : '—') +
      // height dimension
      dimV(artY, artY + artH, artX + artW + 16, hasArt ? dims.h + '&#8243;' : '—') +
      '</svg>';
  }

  function gridLines(W, H, SCALE) {
    var out = '<g stroke="#e7e1d3" stroke-width="0.5">';
    for (var x = SCALE; x < W; x += SCALE) out += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '"/>';
    for (var y = SCALE; y < H; y += SCALE) out += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '"/>';
    return out + '</g>';
  }

  function dimH(x1, x2, y, label) {
    return '<g stroke="#1a1815" stroke-width="1">' +
      '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '"/>' +
      '<line x1="' + x1 + '" y1="' + (y - 4) + '" x2="' + x1 + '" y2="' + (y + 4) + '"/>' +
      '<line x1="' + x2 + '" y1="' + (y - 4) + '" x2="' + x2 + '" y2="' + (y + 4) + '"/>' +
      '</g><text x="' + ((x1 + x2) / 2) + '" y="' + (y - 5) +
      '" text-anchor="middle" font-size="11" font-weight="700" fill="#1a1815">' + label + '</text>';
  }

  function dimV(y1, y2, x, label) {
    return '<g stroke="#1a1815" stroke-width="1">' +
      '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '"/>' +
      '<line x1="' + (x - 4) + '" y1="' + y1 + '" x2="' + (x + 4) + '" y2="' + y1 + '"/>' +
      '<line x1="' + (x - 4) + '" y1="' + y2 + '" x2="' + (x + 4) + '" y2="' + y2 + '"/>' +
      '</g><text x="' + (x + 6) + '" y="' + ((y1 + y2) / 2) +
      '" font-size="11" font-weight="700" fill="#1a1815" ' +
      'transform="rotate(90 ' + (x + 6) + ' ' + ((y1 + y2) / 2) + ')" text-anchor="middle">' + label + '</text>';
  }

  /* ---- Full packet document ---- */
  function buildDoc(order, aspect) {
    var hasArt = !!order.artworkUrl;
    var ord = orderNumber(order);
    var d = order.date instanceof Date ? order.date : new Date(order.date || Date.now());
    var dateStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
    var dims = fitImprint(aspect);
    var method = order.method || 'Screen Print';
    var qty = order.qty || 1;

    var holdBanner = hasArt ? '' :
      '<div class="hold">&#9888; NO ART ON FILE &mdash; DO NOT PRINT &middot; HOLD FOR ARTWORK</div>';

    var artCell = hasArt
      ? '<img class="proof" src="' + esc(order.artworkUrl) + '" alt="proof">'
      : '<div class="proof noart">NO ART<br>SUPPLIED</div>';

    return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<title>' + esc(ord) + ' — Production Packet</title>' +
      '<style>' + STYLES + '</style></head><body>' +

      /* ===== PAGE 1 — PRINT TICKET ===== */
      '<section class="sheet">' +
        holdBanner +
        '<header class="pk-head">' +
          '<div><div class="brand">SKREW&nbsp;U</div><div class="sub">PRINT SHOP &middot; WORK ORDER</div></div>' +
          '<div class="ordbox"><div class="ordno">' + esc(ord) + '</div>' +
          '<div class="barcode">' + barcode(ord) + '</div></div>' +
        '</header>' +

        '<div class="row2">' +
          '<div class="art-panel"><div class="lbl">ART PROOF</div>' + artCell + '</div>' +
          '<div class="meta-panel">' +
            field('ITEM', order.title || 'Untitled') +
            field('DESIGNER', '@' + (order.designer || 'anon')) +
            field('BUYER', '@' + (order.buyer || '—')) +
            field('SOLD FOR', money(order.price)) +
            field('ORDER DATE', dateStr) +
            field('CHANNEL', order.channel || 'SKREWBAY') +
          '</div>' +
        '</div>' +

        '<table class="spec"><thead><tr>' +
          '<th>QTY</th><th>GARMENT</th><th>COLOR</th><th>SIZES</th><th>METHOD</th><th>LOCATION</th>' +
        '</tr></thead><tbody><tr>' +
          '<td>' + esc(qty) + '</td>' +
          '<td>' + esc(order.garment || '________') + '</td>' +
          '<td>' + esc(order.garmentColor || '________') + '</td>' +
          '<td>' + esc(order.sizes || 'S / M / L / XL') + '</td>' +
          '<td>' + esc(method) + '</td>' +
          '<td>' + esc(order.location || 'Full Front') + '</td>' +
        '</tr></tbody></table>' +

        '<div class="prod">' +
          '<div class="prod-title">PRODUCTION CHECKLIST</div>' +
          '<div class="cbx-row">' +
            checkbox('Art approved') + checkbox("Screens burned / file RIP'd") +
            checkbox('Garment pulled') + checkbox('Test print OK') +
            checkbox('Printed') + checkbox('Cured') +
            checkbox('QC & count') + checkbox('Packed / shipped') +
          '</div>' +
        '</div>' +

        '<div class="notes"><div class="lbl">SHOP NOTES</div><div class="lines"></div></div>' +

        '<footer class="pk-foot">' +
          '<span>Generated ' + dateStr + '</span>' +
          '<span class="stamp">NEVER&nbsp;BLANK &#9646; ' + (hasArt ? 'ART VERIFIED' : 'ART MISSING') + '</span>' +
        '</footer>' +
      '</section>' +

      /* ===== PAGE 2 — CAD SHEET ===== */
      '<section class="sheet">' +
        '<header class="pk-head">' +
          '<div><div class="brand">CAD&nbsp;SHEET</div><div class="sub">ART PLACEMENT &amp; IMPRINT SPEC</div></div>' +
          '<div class="ordbox"><div class="ordno">' + esc(ord) + '</div></div>' +
        '</header>' +

        '<div class="cad-row">' +
          '<div class="cad-art">' + cadSvg(order, aspect) + '</div>' +
          '<div class="cad-spec">' +
            specRow('IMPRINT', hasArt ? dims.w + ' &#215; ' + dims.h + ' in' : '&#8212; hold &#8212;') +
            specRow('MAX AREA', MAX_IMPRINT_W + ' &#215; ' + MAX_IMPRINT_H + ' in') +
            specRow('PLACEMENT', order.location || 'Full Front, centered') +
            specRow('TOP DROP', COLLAR_DROP + ' in from collar') +
            specRow('METHOD', method) +
            specRow('INK / COLORS', order.colors || '________') +
            specRow('HALFTONE / LPI', order.lpi || '________') +
            specRow('SUBSTRATE', order.garmentColor || '________') +
            '<div class="regnote">Registration crosshairs mark the artwork bounding box. ' +
            'Align to center chest; hold ' + COLLAR_DROP + '&#8243; below the collar seam.</div>' +
          '</div>' +
        '</div>' +

        '<footer class="pk-foot">' +
          '<span>' + esc(ord) + ' &middot; CAD</span>' +
          '<span class="stamp">' + (hasArt ? 'READY TO OUTPUT' : 'BLOCKED &#8212; NO ART') + '</span>' +
        '</footer>' +
      '</section>' +

      '<div class="toolbar no-print">' +
        '<button onclick="window.print()">Print / Save PDF</button>' +
        '<button onclick="window.close()">Close</button>' +
      '</div>' +
      '</body></html>';
  }

  function field(label, val) {
    return '<div class="fld"><div class="fld-l">' + esc(label) + '</div>' +
      '<div class="fld-v">' + esc(val) + '</div></div>';
  }
  function specRow(label, val) {
    return '<div class="spec-r"><span>' + esc(label) + '</span><b>' + val + '</b></div>';
  }

  // Cheap deterministic bar strip (visual order marker, not a scannable symbology).
  function barcode(seed) {
    var out = '';
    for (var i = 0; i < seed.length; i++) {
      var c = seed.charCodeAt(i);
      var w = (c % 3) + 1;
      out += '<i style="width:' + w + 'px"></i><b style="width:' + (((c >> 2) % 3) + 1) + 'px"></b>';
    }
    return out;
  }

  var STYLES =
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{background:#3a3530;font-family:"Courier New",monospace;color:#1a1815;padding:20px}' +
    '.sheet{background:#faf7ef;width:8.5in;min-height:11in;margin:0 auto 20px;padding:0.5in;' +
      'box-shadow:0 10px 40px rgba(0,0,0,.5);display:flex;flex-direction:column}' +
    '.hold{background:#a32a1f;color:#fff;text-align:center;font-weight:700;letter-spacing:.1em;' +
      'padding:8px;margin-bottom:14px;font-family:"Arial Narrow",sans-serif;font-size:15px}' +
    '.pk-head{display:flex;justify-content:space-between;align-items:flex-start;' +
      'border-bottom:3px solid #1a1815;padding-bottom:10px;margin-bottom:16px}' +
    '.brand{font-family:"Arial Narrow","Helvetica Neue",sans-serif;font-weight:700;font-size:34px;' +
      'letter-spacing:.04em;line-height:1}' +
    '.sub{font-size:10px;letter-spacing:.28em;color:#56504a;margin-top:4px}' +
    '.ordbox{text-align:right}' +
    '.ordno{font-weight:700;font-size:14px;letter-spacing:.06em}' +
    '.barcode{display:flex;justify-content:flex-end;gap:1px;height:34px;margin-top:6px;align-items:flex-end}' +
    '.barcode i,.barcode b{display:inline-block;height:34px;background:#1a1815}' +
    '.barcode b{background:#faf7ef}' +
    '.row2{display:flex;gap:16px;margin-bottom:16px}' +
    '.art-panel{flex:0 0 2.6in}' +
    '.lbl{font-size:9px;letter-spacing:.2em;color:#56504a;margin-bottom:5px}' +
    '.proof{width:100%;height:2.6in;object-fit:contain;background:#fff;border:1px solid #3a3530}' +
    '.proof.noart{display:flex;align-items:center;justify-content:center;text-align:center;' +
      'color:#a32a1f;font-weight:700;font-family:"Arial Narrow",sans-serif;font-size:22px;' +
      'border:2px dashed #a32a1f;background:#fff4f2}' +
    '.meta-panel{flex:1;display:flex;flex-direction:column;gap:8px}' +
    '.fld{border-bottom:1px dotted #a8a194;padding-bottom:5px}' +
    '.fld-l{font-size:9px;letter-spacing:.18em;color:#56504a}' +
    '.fld-v{font-size:16px;font-weight:700;margin-top:2px;word-break:break-word}' +
    '.spec{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px}' +
    '.spec th{background:#1a1815;color:#faf7ef;padding:7px 6px;text-align:left;font-size:9px;letter-spacing:.12em}' +
    '.spec td{border:1px solid #3a3530;padding:9px 6px;font-weight:700}' +
    '.prod{border:1px solid #3a3530;padding:10px 12px;margin-bottom:14px}' +
    '.prod-title{font-size:9px;letter-spacing:.2em;color:#56504a;margin-bottom:8px}' +
    '.cbx-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 12px}' +
    '.cbx{display:flex;align-items:center;gap:7px;font-size:11px}' +
    '.cbx .box{width:13px;height:13px;border:1.5px solid #1a1815;flex:0 0 auto}' +
    '.notes{flex:1;margin-bottom:12px}' +
    '.notes .lines{height:0.9in;border:1px solid #3a3530;border-top:none;' +
      'background:repeating-linear-gradient(#faf7ef 0 27px,#d9d3c4 27px 28px)}' +
    '.notes .lbl{border:1px solid #3a3530;border-bottom:none;padding:4px 8px;background:#efeadd}' +
    '.pk-foot{display:flex;justify-content:space-between;align-items:center;' +
      'border-top:2px solid #1a1815;padding-top:8px;font-size:10px;color:#56504a;margin-top:auto}' +
    '.stamp{font-family:"Arial Narrow",sans-serif;font-weight:700;letter-spacing:.12em;' +
      'color:#a32a1f;border:1.5px solid #a32a1f;padding:3px 8px;transform:rotate(-1.5deg)}' +
    '.cad-row{display:flex;gap:18px;flex:1}' +
    '.cad-art{flex:1;border:1px solid #3a3530;background:#faf7ef;padding:6px}' +
    '.cad-spec{flex:0 0 2.5in;display:flex;flex-direction:column;gap:0}' +
    '.spec-r{display:flex;justify-content:space-between;gap:8px;padding:8px 2px;' +
      'border-bottom:1px solid #d9d3c4;font-size:11px}' +
    '.spec-r span{color:#56504a;letter-spacing:.08em}' +
    '.spec-r b{text-align:right}' +
    '.regnote{margin-top:12px;font-size:10px;line-height:1.5;color:#56504a;' +
      'border-left:3px solid #a32a1f;padding-left:8px}' +
    '.toolbar{position:fixed;bottom:16px;right:16px;display:flex;gap:8px}' +
    '.toolbar button{font-family:"Arial Narrow",sans-serif;font-weight:700;letter-spacing:.08em;' +
      'padding:10px 16px;border:none;background:#1a1815;color:#faf7ef;cursor:pointer;font-size:13px}' +
    '.toolbar button:first-child{background:#a32a1f}' +
    '@media print{body{background:#fff;padding:0}.no-print{display:none!important}' +
      '.sheet{box-shadow:none;margin:0;width:auto;min-height:auto;page-break-after:always}}' +
    '@page{size:letter;margin:0}';

  /* ---- Public entry point ---- */
  function generatePacket(order) {
    order = order || {};
    // Open the window synchronously (inside the click) so pop-up blockers allow it.
    var win = global.open('', '_blank');
    return measureArt(order.artworkUrl).then(function (aspect) {
      var html = buildDoc(order, aspect);
      if (!win) {
        // Pop-up blocked — fall back to a data URL the caller can surface.
        return { blocked: true, html: html };
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      return { blocked: false, window: win, orderNumber: orderNumber(order), hasArt: !!order.artworkUrl };
    });
  }

  global.NeverBlank = {
    generatePacket: generatePacket,
    orderNumber: orderNumber,
    fitImprint: fitImprint,
    MAX_IMPRINT_W: MAX_IMPRINT_W,
    MAX_IMPRINT_H: MAX_IMPRINT_H
  };
})(window);

/* ============ SKREW U · DEPLOY PANEL ============ */
/* Design once -> push to sales channels. Shopify live; eBay/TikTok stubbed. */

/* Same Supabase project as the main site (public anon key). */
const SUPABASE_URL = 'https://qmztuagvxopahowexrum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

/* ---- image compression (mirrors app.js) ---- */
async function compressImage(dataUrl, maxWidth = 1400, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/webp', quality));
    };
    img.src = dataUrl;
  });
}

/* ---- deploy key gate (only shown/used if needed) ---- */
const savedKey = sessionStorage.getItem('skrewu_deploy_key');
if (savedKey) { $('gate').style.display = 'block'; $('deployKey').value = savedKey; }
// Reveal the gate field on demand (double-click the env tag) so it isn't in the way normally.
$('envTag').addEventListener('dblclick', () => { $('gate').style.display = 'block'; });
$('deployKey').addEventListener('change', (e) => sessionStorage.setItem('skrewu_deploy_key', e.target.value.trim()));

/* ---- dropzone ---- */
let imageDataUrl = null;
const dz = $('dz'), dzInput = $('dzInput');
dz.addEventListener('click', () => dzInput.click());
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--acid)'; });
dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
dz.addEventListener('drop', (e) => {
  e.preventDefault(); dz.style.borderColor = '';
  if (e.dataTransfer.files[0]) readImage(e.dataTransfer.files[0]);
});
dzInput.addEventListener('change', (e) => { if (e.target.files[0]) readImage(e.target.files[0]); });

function readImage(file) {
  if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    imageDataUrl = ev.target.result;
    dz.classList.add('has-image');
    dz.querySelectorAll('img').forEach(i => i.remove());
    const img = document.createElement('img');
    img.src = imageDataUrl;
    dz.appendChild(img);
    $('dzLabel').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/* ---- auto-fill description ---- */
$('aiBtn').addEventListener('click', async () => {
  const title = $('title').value.trim();
  if (!title) { alert('Add a product name first — the AI needs something to work with.'); return; }
  const btn = $('aiBtn'); const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Writing…';
  try {
    const res = await fetch('/api/generate-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        keywords: $('keywords').value.trim(),
        productType: $('productType').value.trim(),
      }),
    });
    const data = await res.json();
    if (data.ok && data.description) {
      $('desc').value = data.description;
      if (data.source === 'template') {
        setStatus('Used a template (set ANTHROPIC_API_KEY in Netlify for AI copy).');
      } else {
        setStatus('Description drafted by AI — edit as you like.');
      }
    } else {
      alert('Could not generate a description: ' + (data.error || 'unknown error'));
    }
  } catch (err) {
    alert('Auto-fill failed: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
});

/* ---- helpers ---- */
function setStatus(msg) { $('deployStatus').textContent = msg || ''; }

function logItem(label, state, html) {
  const item = document.createElement('div');
  item.className = 'log-item ' + state;
  item.innerHTML = `<div class="lbl">${label}</div><div>${html}</div>`;
  $('log').prepend(item);
  return item;
}

async function uploadImage() {
  if (!imageDataUrl) return null;
  const compressed = await compressImage(imageDataUrl);
  const blob = await (await fetch(compressed)).blob();
  const fileName = 'deploy-' + Date.now() + '.webp';
  const { error } = await sb.storage.from('listing-photos').upload(fileName, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error('Image upload failed: ' + error.message);
  return sb.storage.from('listing-photos').getPublicUrl(fileName).data.publicUrl;
}

/* ---- deploy ---- */
$('deployBtn').addEventListener('click', async () => {
  const title = $('title').value.trim();
  const description = $('desc').value.trim();
  const price = $('price').value.trim();

  if (!title) return alert('Product name is required.');
  if (!description) return alert('Description is required.');
  if (!price) return alert('Price is required.');
  if (!$('chShopify').checked) return alert('Turn on at least one channel (Shopify is the only live one right now).');

  const btn = $('deployBtn');
  btn.disabled = true; btn.textContent = 'Deploying…';
  $('log').innerHTML = '';

  try {
    // 1) upload the design once, reuse the URL across channels
    let imageUrl = null;
    if (imageDataUrl) {
      const up = logItem('Image', 'pending', 'Uploading design…');
      imageUrl = await uploadImage();
      up.className = 'log-item ok';
      up.querySelector('div:last-child').innerHTML = `Uploaded &rarr; <a href="${imageUrl}" target="_blank" rel="noopener">view</a>`;
    }

    // 2) Shopify
    if ($('chShopify').checked) {
      const row = logItem('Shopify', 'pending', 'Creating product on DEATH CORPS…');
      const headers = { 'Content-Type': 'application/json' };
      const key = $('deployKey').value.trim();
      if (key) headers['x-deploy-key'] = key;

      const payload = {
        title, description, price,
        compareAtPrice: $('compareAt').value.trim() || undefined,
        imageUrl: imageUrl || undefined,
        sku: $('sku').value.trim() || undefined,
        productType: $('productType').value.trim() || undefined,
        tags: $('keywords').value.split(',').map(s => s.trim()).filter(Boolean),
        publish: $('publish').checked,
      };

      const res = await fetch('/api/deploy-shopify', { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.ok) {
        row.className = 'log-item ok';
        const live = data.onlineStoreUrl ? ` &middot; <a href="${data.onlineStoreUrl}" target="_blank" rel="noopener">storefront</a>` : '';
        row.querySelector('div:last-child').innerHTML =
          `Created as <b>${data.status}</b> &rarr; <a href="${data.adminUrl}" target="_blank" rel="noopener">open in Shopify admin</a>${live}`;
      } else {
        row.className = 'log-item err';
        const detail = data.details ? ' — ' + JSON.stringify(data.details) : '';
        row.querySelector('div:last-child').textContent = (data.error || 'Failed') + detail;
      }
    }

    setStatus('Done.');
  } catch (err) {
    logItem('Error', 'err', err.message);
    setStatus('Something failed — see the log.');
  } finally {
    btn.disabled = false; btn.textContent = 'Deploy';
  }
});

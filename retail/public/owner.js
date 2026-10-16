import { $, money, api, send, node, artwork } from './shared.js';
import { readDesignTransfer, acceptsDesignMessage } from './design-bridge.js';
import { importDesign } from './design-import.js';
let products = [], currentId, imagePath = '', artworkPath = '', designSpec = null, variants = [], preview = false, uploading = false, saving = false, dirty = false;
const incoming = new URLSearchParams(location.hash.slice(1));
const connection = { opener: window.opener, origins: [], designerOrigin: incoming.get('designer'), transferId: incoming.get('transfer') };
let received = false, authenticated = false, receipt = null;
const form = $('productForm');
form.addEventListener('input', () => { dirty = true; });
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
function canLeave() { return !dirty || confirm('Leave without saving this shirt?'); }
function edit(p) {
  if (uploading || saving) return false;
  if (!canLeave()) return false;
  currentId = p?.id || crypto.randomUUID(); imagePath = p?.image_path || ''; variants = p ? structuredClone(p.variants) : [];
  artworkPath = p?.artwork_path || ''; designSpec = p?.design_spec || null;
  if (received) $('designImport').hidden = designSpec?.transfer_id !== connection.transferId;
  form.reset();
  for (const key of ['name','description','garment','status']) form.elements[key].value = p?.[key] || (key === 'status' ? 'draft' : '');
  form.elements.price.value = p?.price_cents == null ? '' : (p.price_cents / 100).toFixed(2);
  $('editorTitle').textContent = p ? 'Edit shirt' : 'Add a shirt'; $('statusBadge').textContent = p?.status || 'Draft';
  $('imagePreview').replaceChildren(p ? artwork(p, preview) : node('span', {}, 'Your shirt or design'));
  $('saveMessage').textContent = ''; $('uploadMessage').textContent = '';
  showPrintFile(p?.artwork_url, p?.additional_artwork_urls);
  $('viewProduct').hidden = p?.status !== 'published'; $('viewProduct').href = `index.html?shirt=${currentId}`;
  dirty = false; renderVariants(); renderList(); return true;
}
function showPrintFile(url, additional = []) {
  $('printFile').hidden = !artworkPath;
  $('printFileLink').href = url || '#'; $('printFileLink').hidden = !url;
  $('printDetails').textContent = designSpec ? `${designSpec.placement} · ${designSpec.width_inches} × ${designSpec.height_inches} inches` : 'Original print file attached';
  $('additionalPrintFiles').replaceChildren(...additional.map(item => node('a', { href: item.url, target: '_blank', rel: 'noopener' },
    `${item.placement} original · ${item.width_inches} × ${item.height_inches} inches`)));
}
function tellDesigner(type, message, detail = {}) {
  if (connection.opener && connection.origins.includes(connection.designerOrigin)) connection.opener.postMessage({ type,
    transfer_id: connection.transferId, ...detail, ...(message ? { message } : {}) }, connection.designerOrigin);
}
window.addEventListener('message', async event => {
  if (!authenticated || !acceptsDesignMessage(event, connection) || event.data.type !== 'skrewu:design') return;
  if (received) { tellDesigner('skrewu:received', null, receipt); return; }
  if (uploading || saving) { tellDesigner('skrewu:error', 'The owner desk is busy. Try again after the current upload or save.'); return; }
  try {
    const data = readDesignTransfer(event.data);
    if (!edit()) { tellDesigner('skrewu:error', 'The current shirt has unsaved changes. Save it before importing.'); return; }
    uploading = true; form.inert = true; $('save').disabled = true;
    $('designImport').hidden = false; $('designImportMessage').textContent = 'Receiving your preview and original print files…';
    const upload = file => api('upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    const product = await importDesign(data, { upload, saveProduct: p => send('product', p) });
    received = true; dirty = false; uploading = false;
    if (data.intent === 'publish') products = [product, ...products.filter(p => p.id !== product.id)];
    edit(product); dirty = data.intent !== 'publish';
    receipt = { status: data.intent === 'publish' ? 'published' : 'review', product_id: product.id };
    $('designImportMessage').textContent = data.intent === 'publish'
      ? (preview ? 'Published in this local review. No live listing was created.' : 'Published to SKREWU. This shirt is now visible in your shop.')
      : 'Design received. Review the price, shirt details and options, then save your draft. Publish when ready.';
    tellDesigner('skrewu:received', null, receipt);
  } catch (error) {
    $('designImport').hidden = false; $('designImportMessage').textContent = error.message;
    tellDesigner('skrewu:error', error.message);
  } finally { uploading = false; form.inert = false; $('save').disabled = false; }
});
function renderList() {
  $('list').replaceChildren();
  if (!products.length) $('list').append(node('p', { class: 'small' }, 'Your first shirt starts here.'));
  for (const p of products) {
    const button = node('button', { class: `list-item ${p.id === currentId ? 'selected' : ''}` });
    if (p.image_url) button.append(node('img', { src: p.image_url, alt: '' }));
    const body = node('div'); body.append(node('strong', {}, p.name), node('span', {}, `${p.status} · ${money(p.price_cents)}`));
    button.append(body); button.onclick = () => edit(p); $('list').append(button);
  }
}
function renderVariants() {
  $('variants').replaceChildren();
  for (const [i,v] of variants.entries()) {
    const row = node('div', { class: 'variant' }); row.append(node('span', {}, `${v.size} / ${v.color}`));
    const label = node('label'); const checkbox = node('input', { type: 'checkbox', 'aria-label': `${v.size} ${v.color} available` }); checkbox.checked = v.available;
    checkbox.onchange = () => { v.available = checkbox.checked; dirty = true; };
    label.append(checkbox, document.createTextNode('Available')); row.append(label);
    const remove = node('button', { type: 'button', 'aria-label': `Remove ${v.size} ${v.color}` }, '×');
    remove.onclick = () => { variants.splice(i, 1); dirty = true; renderVariants(); }; row.append(remove); $('variants').append(row);
  }
}
$('addVariant').onclick = () => {
  const size = $('variantSize').value.trim(), color = $('variantColor').value.trim();
  if (!size || !color) { $('saveMessage').textContent = 'Enter a size and color, then add the option.'; return; }
  if (variants.some(v => v.size.toLowerCase() === size.toLowerCase() && v.color.toLowerCase() === color.toLowerCase())) { $('saveMessage').textContent = 'That option is already listed.'; return; }
  variants.push({ size, color, available: true }); dirty = true; $('variantSize').value = ''; $('variantSize').focus(); $('saveMessage').textContent = ''; renderVariants();
};
$('new').onclick = () => edit();
$('photo').onchange = async () => {
  const file = $('photo').files[0]; if (!file) return;
  if (file.size > 4 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) { $('uploadMessage').textContent = 'Choose a PNG, JPG or WebP smaller than 4 MB.'; return; }
  uploading = true; $('save').disabled = true; $('uploadMessage').textContent = 'Uploading your photo…';
  $('photo').disabled = true;
  try {
    const result = await api('upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    imagePath = result.image_path; dirty = true; $('imagePreview').replaceChildren(node('img', { src: result.image_url, alt: 'Your uploaded photo' })); $('uploadMessage').textContent = 'Photo uploaded. Save the shirt to keep this change.';
  } catch (e) { $('uploadMessage').textContent = e.message; }
  finally { uploading = false; $('save').disabled = false; $('photo').disabled = false; }
};
form.onsubmit = async e => {
  e.preventDefault(); if (uploading || saving) return;
  if ($('variantSize').value.trim()) { $('saveMessage').textContent = 'Add the unfinished size/color option before saving.'; return; }
  saving = true; $('save').disabled = true; $('photo').disabled = true; $('saveMessage').textContent = 'Saving…';
  const p = { id: currentId, image_path: imagePath, artwork_path: artworkPath, design_spec: designSpec, variants,
    price_cents: Math.round(Number(form.elements.price.value) * 100) };
  for (const key of ['name','description','garment','status']) p[key] = form.elements[key].value;
  try {
    await send('product', p); dirty = false; await refresh(false); saving = false; edit(products.find(x => x.id === currentId));
    $('saveMessage').textContent = p.status === 'published' ? (preview ? 'Published in this local review. Open the shop to see it.' : 'Published. This shirt is now visible in the shop.') : p.status === 'archived' ? 'Archived. This shirt is off the rack.' : 'Draft saved. Only you can see it.';
  } catch (e) { $('saveMessage').textContent = e.message; }
  finally { saving = false; $('save').disabled = false; $('photo').disabled = false; }
};
async function refresh(select = true) {
  const data = await api('owner'); products = data.products; preview = data.preview;
  authenticated = true; connection.origins = data.designerOrigins || [];
  $('preview').hidden = !preview; $('loginPanel').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
  $('setupTitle').textContent = preview ? 'Review desk — try the full product workflow' : data.checkoutReady ? 'Checkout is connected' : 'Products can be prepared. Checkout is not open.';
  $('setupMessage').textContent = preview ? 'Uploads and product changes are saved on this computer. Sample shirts are examples; nothing here is for sale.' : 'Manage your shirts here. Paid retail orders go to SKREW U in OmniFlow after the payment connection is verified.';
  $('setupDetails').hidden = preview || !data.setup.length; $('setupList').replaceChildren(...data.setup.map(x => node('li', {}, x)));
  renderList(); if (select) edit();
  if (connection.transferId && !received) {
    $('designImport').hidden = false;
    $('designImportMessage').textContent = connection.origins.includes(connection.designerOrigin) && connection.opener
      ? 'Waiting for your designer to send the finished shirt…' : 'This designer is not connected to the shop yet. Your artwork remains in the designer.';
    tellDesigner('skrewu:ready', null, { capabilities: ['publish', 'additional_prints'] });
  }
}
$('loginForm').onsubmit = async e => {
  e.preventDefault(); $('loginMessage').textContent = 'Signing in…';
  const button = e.submitter; button.disabled = true;
  try { await send('login', { email: e.target.elements.email.value, password: e.target.elements.password.value }); e.target.reset(); await refresh(); }
  catch (e) { $('loginMessage').textContent = e.message; } finally { button.disabled = false; }
};
$('demoLogin').onclick = async () => { try { await send('login', { email: 'review@localhost', password: 'local-review' }); await refresh(); } catch (e) { $('loginMessage').textContent = e.message; } };
$('logout').onclick = async () => {
  if (!canLeave()) return;
  try { await send('logout', {}); dirty = false; location.reload(); } catch (e) { $('saveMessage').textContent = e.message; }
};
async function init() {
  try { await refresh(); }
  catch (e) {
    if (e.status !== 401) $('loginMessage').textContent = e.message;
    try { const data = await api('catalog'); preview = data.preview; $('preview').hidden = !preview; $('demoLogin').hidden = !preview; $('loginForm').hidden = preview; } catch { /* sign-in still explains setup */ }
  }
}
init();

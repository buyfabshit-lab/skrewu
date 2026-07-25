/* ============================================================
   SKREW U — Multi-Shop Order Intake
   Shops fill this out; each submission lands in Supabase
   (public.shop_orders) with artwork in the order-artwork bucket.
   ============================================================ */

/* ── Supabase client (same project as the main SKREW U site) ── */
const SUPABASE_URL = 'https://qmztuagvxopahowexrum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ARTWORK_BUCKET = 'order-artwork';
const SIZE_KEYS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'OS'];

/* ── DOM refs ── */
const form        = document.getElementById('orderForm');
const itemsList   = document.getElementById('itemsList');
const itemTpl     = document.getElementById('itemTpl');
const addItemBtn  = document.getElementById('addItemBtn');
const submitBtn   = document.getElementById('submitBtn');
const formNote    = document.getElementById('formNote');
const sumItemsEl  = document.getElementById('sumItems');
const sumQtyEl    = document.getElementById('sumQty');
const successView = document.getElementById('successView');

let itemSeq = 0; // ever-increasing id for stable card identity

/* ── Human-friendly order reference (client-generated) ── */
function makeOrderRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let tail = '';
  const buf = new Uint32Array(5);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 5; i++) tail += alphabet[buf[i] % alphabet.length];
  return 'SU-' + tail;
}

/* ── Add one line-item card ── */
function addItem() {
  const node = itemTpl.content.firstElementChild.cloneNode(true);
  node.dataset.seq = String(++itemSeq);
  itemsList.appendChild(node);

  // remove button
  node.querySelector('[data-remove]').addEventListener('click', () => {
    node.remove();
    renumberItems();
    recalcTotals();
  });

  // size inputs → live totals + highlight
  node.querySelectorAll('[data-size]').forEach(inp => {
    inp.addEventListener('input', () => {
      inp.classList.toggle('has-val', Number(inp.value) > 0);
      recalcItemQty(node);
      recalcTotals();
    });
  });

  // artwork preview
  const dz = node.querySelector('[data-dz]');
  const fileInput = node.querySelector('[data-field="artwork"]');
  fileInput.addEventListener('change', () => renderDropzone(dz, fileInput.files[0]));

  renumberItems();
  recalcTotals();
  return node;
}

/* ── Renumber the "Item N" tags after add/remove ── */
function renumberItems() {
  const cards = [...itemsList.querySelectorAll('[data-item]')];
  cards.forEach((card, i) => {
    card.querySelector('[data-tag]').textContent = 'Item ' + (i + 1);
    // keep at least one non-removable card
    card.querySelector('[data-remove]').style.visibility = cards.length > 1 ? 'visible' : 'hidden';
  });
}

/* ── Per-card quantity ── */
function itemQty(card) {
  let n = 0;
  card.querySelectorAll('[data-size]').forEach(inp => { n += Number(inp.value) || 0; });
  return n;
}
function recalcItemQty(card) {
  card.querySelector('[data-item-qty]').textContent = itemQty(card);
}

/* ── Grand totals in the sticky bar ── */
function recalcTotals() {
  const cards = [...itemsList.querySelectorAll('[data-item]')];
  let qty = 0;
  cards.forEach(c => { qty += itemQty(c); });
  sumItemsEl.textContent = cards.length;
  sumQtyEl.textContent = qty;
}

/* ── Dropzone visual state ── */
function renderDropzone(dz, file) {
  const ico  = dz.querySelector('[data-dz-ico]');
  const main = dz.querySelector('[data-dz-main]');
  const sub  = dz.querySelector('[data-dz-sub]');
  // clear any prior thumb
  dz.querySelectorAll('.dz-thumb,.dz-file').forEach(el => el.remove());

  if (!file) {
    dz.classList.remove('filled');
    ico.style.display = ''; main.textContent = 'Drop artwork'; sub.style.display = '';
    return;
  }
  dz.classList.add('filled');
  ico.style.display = 'none';
  sub.style.display = 'none';
  main.textContent = 'Swap file';

  if (file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.className = 'dz-thumb';
    img.alt = file.name;
    img.src = URL.createObjectURL(file);
    dz.insertBefore(img, ico);
  }
  const label = document.createElement('span');
  label.className = 'dz-file';
  label.textContent = file.name;
  dz.appendChild(label);
}

/* ── Validation helpers ── */
function setInvalid(fieldId, bad) {
  const el = document.getElementById(fieldId);
  if (el) el.classList.toggle('invalid', bad);
}
function markField(inputEl, bad) {
  const field = inputEl.closest('.field');
  if (field) field.classList.toggle('invalid', bad);
}
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/* ── Upload one artwork file, return its public URL (or null) ── */
async function uploadArtwork(file, orderRef, idx) {
  if (!file) return { url: null, name: null };
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${orderRef}/item-${idx + 1}-${Date.now()}-${safe}`;
  const { error } = await sb.storage
    .from(ARTWORK_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) {
    console.error('artwork upload failed', error);
    return { url: null, name: file.name, uploadError: true };
  }
  const { data } = sb.storage.from(ARTWORK_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, name: file.name };
}

/* ── Gather + validate the whole form ── */
function collectAndValidate() {
  let ok = true;

  const shopName    = document.getElementById('shopName').value.trim();
  const contactName = document.getElementById('contactName').value.trim();
  const email       = document.getElementById('email').value.trim();
  const phone       = document.getElementById('phone').value.trim();
  const neededBy    = document.getElementById('neededBy').value || null;
  const rush        = document.getElementById('rush').checked;
  const notes       = document.getElementById('notes').value.trim();

  setInvalid('f-shop', !shopName);
  setInvalid('f-email', !isEmail(email));
  if (!shopName || !isEmail(email)) ok = false;

  const cards = [...itemsList.querySelectorAll('[data-item]')];
  const items = [];

  cards.forEach(card => {
    const get = sel => card.querySelector(sel);
    const productEl = get('[data-field="product"]');
    const descEl    = get('[data-field="description"]');
    const product   = productEl.value.trim();
    const desc      = descEl.value.trim();

    markField(productEl, !product);
    markField(descEl, !desc);
    if (!product) ok = false;
    if (!desc) ok = false;

    const sizes = {};
    let qty = 0;
    card.querySelectorAll('[data-size]').forEach(inp => {
      const n = Number(inp.value) || 0;
      if (n > 0) { sizes[inp.dataset.size] = n; qty += n; }
    });

    items.push({
      _card: card,
      product,
      color: get('[data-field="color"]').value.trim(),
      description: desc,
      print_locations: get('[data-field="print_locations"]').value.trim(),
      method: get('[data-field="method"]').value,
      sizes,
      qty,
      notes: get('[data-field="notes"]').value.trim(),
      _file: get('[data-field="artwork"]').files[0] || null
    });
  });

  const totalQty = items.reduce((s, it) => s + it.qty, 0);
  if (totalQty === 0) ok = false; // an order with zero pieces is not an order

  return { ok, totalQty, header: { shopName, contactName, email, phone, neededBy, rush, notes }, items };
}

/* ── Submit ── */
async function handleSubmit(e) {
  e.preventDefault();
  const { ok, totalQty, header, items } = collectAndValidate();

  if (!ok) {
    formNote.textContent = totalQty === 0 && items.length
      ? 'Add at least one piece — fill a size quantity before sending.'
      : 'Check the highlighted fields — shop name, a valid email, and each item needs a product + description.';
    formNote.style.color = 'var(--rust-bright)';
    const firstBad = form.querySelector('.invalid');
    if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  submitBtn.disabled = true;
  const origLabel = submitBtn.textContent;
  submitBtn.textContent = 'Sending…';
  formNote.style.color = 'var(--bone-dim)';
  formNote.textContent = 'Uploading artwork and logging your order…';

  const orderRef = makeOrderRef();

  try {
    // Upload artwork for each item (sequentially — small counts, keeps it simple/robust)
    const cleanItems = [];
    let hadUploadTrouble = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const art = await uploadArtwork(it._file, orderRef, i);
      if (art.uploadError) hadUploadTrouble = true;
      cleanItems.push({
        product: it.product,
        color: it.color,
        description: it.description,
        print_locations: it.print_locations,
        method: it.method,
        sizes: it.sizes,
        qty: it.qty,
        notes: it.notes,
        artwork_url: art.url,
        artwork_name: art.name
      });
    }

    const { error } = await sb.from('shop_orders').insert({
      order_ref: orderRef,
      shop_name: header.shopName,
      contact_name: header.contactName || null,
      email: header.email,
      phone: header.phone || null,
      rush: header.rush,
      needed_by: header.neededBy,
      items: cleanItems,
      item_count: cleanItems.length,
      qty_total: totalQty,
      notes: header.notes || null
    });

    if (error) throw error;

    showSuccess(orderRef, header.email, hadUploadTrouble);
  } catch (err) {
    console.error('order submit failed', err);
    submitBtn.disabled = false;
    submitBtn.textContent = origLabel;
    formNote.style.color = 'var(--rust-bright)';
    formNote.textContent = 'Something jammed on our end — order not sent. Try again, or email us directly.';
  }
}

/* ── Success screen ── */
function showSuccess(orderRef, email, hadUploadTrouble) {
  document.getElementById('successRef').textContent = orderRef;
  document.getElementById('successEmail').textContent = email;
  form.style.display = 'none';
  successView.style.display = 'block';
  if (hadUploadTrouble) {
    const p = document.createElement('p');
    p.style.color = 'var(--ember)';
    p.textContent = 'Heads up: one or more artwork files didn’t upload — we’ll reach out for those.';
    successView.querySelector('.btn-again').before(p);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Reset for another order ── */
function resetForm() {
  form.reset();
  itemsList.innerHTML = '';
  addItem();
  form.style.display = '';
  successView.style.display = 'none';
  // clear any stray "trouble" note appended on success
  successView.querySelectorAll('p[style*="ember"]').forEach(el => el.remove());
  submitBtn.disabled = false;
  submitBtn.textContent = 'Send to the floor →';
  formNote.style.color = 'var(--iron-light)';
  formNote.textContent = 'Your order lands in the SKREW U production queue. We’ll email a quote before anything runs.';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Wire up ── */
addItemBtn.addEventListener('click', () => {
  const node = addItem();
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.getElementById('againBtn').addEventListener('click', resetForm);
form.addEventListener('submit', handleSubmit);

// clear invalid state as the user fixes things
form.addEventListener('input', e => {
  const field = e.target.closest && e.target.closest('.field.invalid');
  if (field) field.classList.remove('invalid');
});

// start with one empty item card
addItem();

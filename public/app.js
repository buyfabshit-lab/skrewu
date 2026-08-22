/* ============ SUPABASE CLIENT ============ */
const SUPABASE_URL = 'https://qmztuagvxopahowexrum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cbwgMdVv6XDxLp0WOBsM-w_irvs7BAh';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
/* ========================================= */

const navburger = document.getElementById('navburger');
const navlinks = document.getElementById('navlinks');
navburger.addEventListener('click', () => {
  const isOpen = navlinks.classList.toggle('open');
  navburger.setAttribute('aria-expanded', isOpen);
});
navlinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  navlinks.classList.remove('open');
  navburger.setAttribute('aria-expanded','false');
}));

window.addEventListener('DOMContentLoaded', () => {
  const flash = document.getElementById('flashOverlay');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    flash.style.display = 'none';
    return;
  }
  flash.style.transition = 'opacity 0.08s linear';
  flash.style.opacity = '1';
  setTimeout(()=> flash.style.opacity = '0', 60);
  setTimeout(()=> flash.style.opacity = '1', 160);
  setTimeout(()=> { flash.style.transition='opacity 0.6s ease'; flash.style.opacity = '0'; }, 220);
});

const lightning = document.getElementById('lightningFlash');
function strikeLightning(){
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  lightning.style.transition = 'opacity 0.06s linear';
  lightning.style.opacity = 0.35;
  setTimeout(()=>{ lightning.style.opacity = 0; }, 80);
  setTimeout(()=>{ lightning.style.opacity = 0.2; }, 180);
  setTimeout(()=>{ lightning.style.opacity = 0; }, 240);
}
setInterval(strikeLightning, 7000 + Math.random()*5000);

(function(){
  const canvas = document.getElementById('emberCanvas');
  const ctx = canvas.getContext('2d');
  let w, h, embers = [];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize(){
    w = canvas.width = canvas.offsetWidth;
    h = canvas.height = canvas.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function makeEmber(){
    return {
      x: Math.random()*w,
      y: h + Math.random()*40,
      r: 1 + Math.random()*2.2,
      speed: 0.4 + Math.random()*1.1,
      drift: (Math.random()-0.5)*0.6,
      life: 0,
      maxLife: 200 + Math.random()*200,
      hue: Math.random() > 0.5 ? '196,241,53' : '255,107,53'
    };
  }
  for(let i=0;i<40;i++) embers.push(makeEmber());

  function tick(){
    ctx.clearRect(0,0,w,h);
    embers.forEach(e=>{
      e.y -= e.speed;
      e.x += e.drift;
      e.life++;
      const fade = 1 - (e.life/e.maxLife);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(${e.hue}, ${Math.max(fade,0)*0.8})`;
      ctx.fill();
      if (e.life > e.maxLife || e.y < -20){
        Object.assign(e, makeEmber());
      }
    });
    if (!reduced) requestAnimationFrame(tick);
  }
  if (!reduced) requestAnimationFrame(tick);
})();

const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries)=>{
  entries.forEach(en=>{
    if (en.isIntersecting){ en.target.classList.add('is-visible'); io.unobserve(en.target); }
  });
}, {threshold:0.15});
revealEls.forEach(el=>io.observe(el));

/* ============ IMAGE COMPRESSION HELPER ============ */
async function compressImage(dataUrl, maxWidth = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * maxWidth / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/webp', quality));
    };
    img.src = dataUrl;
  });
}

/* ============ SKREWBAY (auction) ============ */
/* ── Supabase-backed listings ── */
let listings = [];
async function loadListings(){
  const { data, error } = await sb.from('listings').select('*').order('created_at', {ascending:false});
  if (error){ console.error('loadListings:', error); return; }
  listings = (data || []).map(r => ({
    id: r.id, title: r.title, seller: r.seller,
    photo: r.photo_url, startPrice: parseFloat(r.start_price),
    buyNowPrice: r.buy_now_price ? parseFloat(r.buy_now_price) : null,
    currentBid: parseFloat(r.current_bid), currentBidder: r.current_bidder,
    bids: [], endsAt: new Date(r.ends_at).getTime(), ended: r.ended
  }));
  // Load bids for each listing
  const { data: bidsData } = await sb.from('bids').select('*').order('placed_at', {ascending:true});
  if (bidsData){
    bidsData.forEach(b => {
      const l = listings.find(l => l.id === b.listing_id);
      if (l) l.bids.push({ bidder: b.bidder, amount: parseFloat(b.amount) });
    });
  }
  renderProducts();
}
loadListings();
const ANTI_SNIPE_WINDOW_MS = 2 * 60 * 1000;   // bids inside last 2 min extend the clock
const ANTI_SNIPE_EXTEND_MS = 3 * 60 * 1000;   // extend by 3 min

const uploadModal = document.getElementById('uploadModal');
const openUploadBtn = document.getElementById('openUploadBtn');
const closeUploadBtn = document.getElementById('closeUploadBtn');
openUploadBtn.addEventListener('click', ()=> uploadModal.classList.add('open'));
closeUploadBtn.addEventListener('click', ()=> uploadModal.classList.remove('open'));
uploadModal.addEventListener('click', (e)=>{ if (e.target === uploadModal) uploadModal.classList.remove('open'); });

let frontDataUrl = null;

function wireDropzone(zoneId, inputId){
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  zone.addEventListener('click', (e)=>{ if(e.target.tagName !== 'INPUT') input.click(); });
  input.addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev)=>{
      frontDataUrl = ev.target.result;
      zone.classList.add('has-image');
      zone.querySelectorAll('img').forEach(i=>i.remove());
      const img = document.createElement('img');
      img.src = frontDataUrl;
      zone.appendChild(img);
      const label = zone.querySelector('.dz-label');
      if (label) label.style.display = 'none';
      const req = zone.querySelector('.dz-req');
      if (req) req.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });
}
wireDropzone('dzFront','dzFrontInput');

const durationChipGrid = document.getElementById('durationChipGrid');
durationChipGrid.querySelectorAll('.size-chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    durationChipGrid.querySelectorAll('.size-chip').forEach(c=>c.classList.remove('on'));
    chip.classList.add('on');
  });
});

const submitShirtBtn = document.getElementById('submitShirtBtn');
submitShirtBtn.addEventListener('click', ()=>{
  const title = document.getElementById('shirtName').value.trim() || 'Untitled Item';
  const seller = (document.getElementById('sellerHandle').value.trim() || 'anon').toUpperCase();
  const startPrice = parseFloat(document.getElementById('shirtPrice').value) || 0;
  const buyNowRaw = document.getElementById('buyNowPrice').value.trim();
  const buyNowPrice = buyNowRaw ? parseFloat(buyNowRaw) : null;
  if (!frontDataUrl){
    alert('Add a photo first.');
    return;
  }
  const selectedChip = durationChipGrid.querySelector('.size-chip.on') || durationChipGrid.querySelector('.size-chip');
  const hours = parseInt(selectedChip.dataset.hours, 10);
  const now = Date.now();
  // Upload photo to Supabase Storage, then insert listing
  (async () => {
    let photoUrl = null;
    if (frontDataUrl) {
      // Compress image before upload (max 1200px, 82% quality WebP)
      const compressed = await compressImage(frontDataUrl, 1200, 0.82);
      const res = await fetch(compressed);
      const blob = await res.blob();
      const fileName = 'listing-' + Date.now() + '.webp';
      const { data: upData, error: upErr } = await sb.storage.from('listing-photos').upload(fileName, blob, { contentType: blob.type, upsert: false });
      if (!upErr) {
        const { data: urlData } = sb.storage.from('listing-photos').getPublicUrl(fileName);
        photoUrl = urlData.publicUrl;
      }
    }
    const endsAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const { data: newListing, error } = await sb.from('listings').insert({
      title, seller, photo_url: photoUrl,
      start_price: startPrice, buy_now_price: buyNowPrice,
      current_bid: startPrice, ends_at: endsAt
    }).select().single();
    if (error) { alert('Failed to list item: ' + error.message); return; }
    listings.unshift({
      id: newListing.id, title, seller, photo: photoUrl || frontDataUrl,
      startPrice, buyNowPrice, currentBid: startPrice,
      currentBidder: null, bids: [],
      endsAt: new Date(endsAt).getTime(), ended: false
    });
    renderProducts();
  })();
  document.getElementById('shirtName').value = '';
  document.getElementById('sellerHandle').value = '';
  document.getElementById('shirtPrice').value = '';
  document.getElementById('buyNowPrice').value = '';
  frontDataUrl = null;
  const z = document.getElementById('dzFront');
  z.classList.remove('has-image');
  z.querySelectorAll('img').forEach(i=>i.remove());
  const label = z.querySelector('.dz-label'); if(label) label.style.display='';
  const req = z.querySelector('.dz-req'); if(req) req.style.display='';
  uploadModal.classList.remove('open');
});

function formatCountdown(ms){
  if (ms <= 0) return 'Auction ended';
  const totalSec = Math.floor(ms/1000);
  const h = Math.floor(totalSec/3600);
  const m = Math.floor((totalSec%3600)/60);
  const s = totalSec%60;
  return `${h}h ${m}m ${s}s left`;
}

function renderProducts(){
  const grid = document.getElementById('productGrid');
  if (listings.length === 0){
    grid.innerHTML = `<div class="shop-empty-state" id="shopEmptyState"><h3>Nothing on the floor yet.</h3><p>Be the first to put something up. Hit "List an Item" above.</p></div>`;
    return;
  }
  grid.innerHTML = listings.map(item => {
    const remaining = item.endsAt - Date.now();
    const isEnded = remaining <= 0;
    const isUrgent = !isEnded && remaining < ANTI_SNIPE_WINDOW_MS;
    const statusClass = isEnded ? 'ended' : (isUrgent ? 'ending-soon' : 'live');
    const statusLabel = isEnded ? 'Ended' : (isUrgent ? 'Ending Soon' : 'Live');
    return `
    <article class="product-card" data-id="${item.id}">
      <div class="product-art">
        <span class="auction-status ${statusClass}">${statusLabel}</span>
        <img src="${item.photo}" alt="${item.title}">
      </div>
      <div class="product-info">
        <h4>${item.title}</h4>
        <div class="product-seller">Listed by <b>@${item.seller}</b></div>
        <div class="bid-row">
          <span class="bid-current-label">${item.bids.length ? 'Current Bid' : 'Starting Bid'}</span>
          <span class="bid-current-amount">$${item.currentBid.toFixed(2)}</span>
        </div>
        <div class="bid-count">${item.bids.length} bid${item.bids.length === 1 ? '' : 's'}</div>
        <div class="auction-countdown ${isEnded ? 'ended-label' : (isUrgent ? 'urgent' : '')}" data-countdown="${item.id}">${formatCountdown(remaining)}</div>
        <button class="btn-bid" data-detail="${item.id}" ${isEnded ? 'disabled' : ''}>${isEnded ? 'Auction Ended' : 'View & Bid'}</button>
      </div>
    </article>
  `;
  }).join('');

  grid.querySelectorAll('[data-detail]').forEach(btn=>{
    btn.addEventListener('click', ()=> openBidDetail(btn.dataset.detail));
  });
}

// Live countdown ticking, separate from full re-render so bid history doesn't flicker
setInterval(()=>{
  document.querySelectorAll('[data-countdown]').forEach(el=>{
    const item = listings.find(l => l.id === el.dataset.countdown);
    if (!item) return;
    const remaining = item.endsAt - Date.now();
    if (remaining <= 0 && !item.ended){
      item.ended = true;
      renderProducts();
      return;
    }
    el.textContent = formatCountdown(remaining);
    if (remaining < ANTI_SNIPE_WINDOW_MS && remaining > 0){
      el.classList.add('urgent');
    }
  });
  if (currentDetailId) updateBidDetailCountdown();
}, 1000);

let currentDetailId = null;
const bidModal = document.getElementById('bidModal');
document.getElementById('closeBidBtn').addEventListener('click', ()=> bidModal.classList.remove('open'));
bidModal.addEventListener('click', (e)=>{ if (e.target === bidModal) bidModal.classList.remove('open'); });

function openBidDetail(id){
  currentDetailId = id;
  const item = listings.find(l => l.id === id);
  if (!item) return;
  document.getElementById('bidDetailImg').src = item.photo;
  document.getElementById('bidDetailImg').alt = item.title;
  document.getElementById('bidDetailTitle').textContent = item.title;
  document.getElementById('bidDetailSeller').textContent = `Listed by @${item.seller}`;
  document.getElementById('bidDetailCurrent').textContent = `$${item.currentBid.toFixed(2)}`;
  renderBidHistory(item);
  document.getElementById('bidAmountInput').value = '';
  // A fixed-price listing opens with the bid already at the buy-now price, so
  // there is nothing to bid. The server refuses either way; this is so the page
  // stops inviting a bid it knows will bounce.
  const fixedPrice = item.buyNowPrice != null && item.currentBid >= item.buyNowPrice;
  document.getElementById('bidAmountInput').placeholder = fixedPrice
    ? 'Fixed price — buy it below'
    : `More than $${item.currentBid.toFixed(2)}`;
  const buyBtn = document.getElementById('buyNowDetailBtn');
  if (item.buyNowPrice && !item.ended){
    buyBtn.style.display = 'block';
    document.getElementById('buyNowDetailPrice').textContent = `$${item.buyNowPrice.toFixed(2)}`;
  } else {
    buyBtn.style.display = 'none';
  }
  document.getElementById('bidDetailNote').textContent = item.ended
    ? 'This auction has ended.'
    : fixedPrice
      ? 'One price, no bidding — buy it outright.'
      : 'Bids inside the last 2 minutes extend the clock by 3 minutes.';
  document.getElementById('placeBidBtn').disabled = item.ended || fixedPrice;
  document.getElementById('bidAmountInput').disabled = item.ended || fixedPrice;
  updateBidDetailCountdown();
  bidModal.classList.add('open');
}

function updateBidDetailCountdown(){
  const item = listings.find(l => l.id === currentDetailId);
  if (!item) return;
  const remaining = item.endsAt - Date.now();
  const el = document.getElementById('bidDetailCountdown');
  el.textContent = formatCountdown(remaining);
  el.classList.toggle('urgent', remaining > 0 && remaining < ANTI_SNIPE_WINDOW_MS);
  el.classList.toggle('ended-label', remaining <= 0);
}

function renderBidHistory(item){
  const list = document.getElementById('bidHistoryList');
  if (item.bids.length === 0){
    list.innerHTML = `<div class="bid-history-empty">No bids yet — be the first.</div>`;
    return;
  }
  list.innerHTML = item.bids.slice().reverse().map(b => `
    <div class="bid-history-row"><span>@${b.bidder}</span><b>$${b.amount.toFixed(2)}</b></div>
  `).join('');
}

document.getElementById('placeBidBtn').addEventListener('click', ()=>{
  const item = listings.find(l => l.id === currentDetailId);
  if (!item || item.ended) return;
  const amount = parseFloat(document.getElementById('bidAmountInput').value);
  if (!amount || amount <= item.currentBid){
    alert(`Bid must be higher than the current bid of $${item.currentBid.toFixed(2)}.`);
    return;
  }
  const bidderHandle = (document.getElementById('sellerHandle').value.trim() || 'anon').toUpperCase();
  (async () => {
    const { data: result, error } = await sb.rpc('place_bid', {
      p_listing_id: item.id, p_bidder: bidderHandle, p_amount: amount
    });
    if (error || !result.ok) {
      alert(result?.error || error?.message || 'Bid failed');
      return;
    }
    await loadListings();
    const updatedItem = listings.find(l => l.id === currentDetailId);
    if (updatedItem) {
      document.getElementById('bidDetailCurrent').textContent = `$${updatedItem.currentBid.toFixed(2)}`;
      renderBidHistory(updatedItem);
    }
  })()

  document.getElementById('bidDetailCurrent').textContent = `$${item.currentBid.toFixed(2)}`;
  document.getElementById('bidAmountInput').value = '';
  document.getElementById('bidAmountInput').placeholder = `More than $${item.currentBid.toFixed(2)}`;
  renderBidHistory(item);
  renderProducts();
});

document.getElementById('buyNowDetailBtn').addEventListener('click', ()=>{
  const item = listings.find(l => l.id === currentDetailId);
  if (!item || item.ended || !item.buyNowPrice) return;
  const bidderHandle = (document.getElementById('sellerHandle').value.trim() || 'anon').toUpperCase();
  item.currentBid = item.buyNowPrice;
  item.currentBidder = bidderHandle;
  item.bids.push({bidder: bidderHandle, amount: item.buyNowPrice});
  item.ended = true;
  item.endsAt = Date.now();
  bidModal.classList.remove('open');
  renderProducts();
});

renderProducts();

/* ============ WEEKLYGRAM ============ */
const ZONE_LABEL = {designs:'Designs', sound:'Sound', floor:'The Floor'};
const TILTS = [-1.4, 0.8, -0.5, 1.6, -2, 1, 0.3, -1.1];

/* ── Supabase-backed pins ── */
let pins = [];
async function loadPins(){
  const { data, error } = await sb.from('pins').select('*, pin_replies(*)').order('created_at', {ascending:false});
  if (error){ console.error('loadPins:', error); return; }
  pins = (data || []).map(r => ({
    id: r.id, handle: r.handle, zone: r.zone,
    caption: r.caption, media: r.media_url,
    likes: r.likes, liked: false,
    replies: (r.pin_replies || []).map(rep => ({ h: rep.handle, t: rep.body }))
  }));
  renderTicker();
  const activeZone = document.querySelector('.wg-zone-tab.active')?.dataset.zone || 'all';
  renderWall(activeZone);
}
loadPins();

function timeAgoLabel(i){
  const opts = ['2m','11m','38m','1h','3h','6h','yesterday'];
  return opts[i % opts.length];
}

function renderTicker(){
  const track = document.getElementById('tickerTrack');
  const items = pins.slice(0,8).map(p => `<span><b>${p.handle}</b> pinned in ${ZONE_LABEL[p.zone]}</span>`);
  const doubled = items.concat(items); // seamless loop
  track.innerHTML = doubled.join('');
}

function renderWall(filterZone){
  const wall = document.getElementById('wgWall');
  const list = filterZone === 'all' ? pins : pins.filter(p => p.zone === filterZone);
  if (list.length === 0){
    wall.innerHTML = `<div class="shop-empty-state" style="grid-column:1/-1;">Nothing pinned here yet. Be the first.</div>`;
    return;
  }
  wall.innerHTML = list.map((p, i) => `
    <article class="pin-card" style="--tilt:${TILTS[i % TILTS.length]}deg;" data-id="${p.id}">
      <span class="pin-zone-tag">${ZONE_LABEL[p.zone]}</span>
      ${p.media ? `<img class="pin-media" src="${p.media}" alt="">` : ''}
      <div class="pin-handle">@${p.handle}</div>
      <p class="pin-caption">${p.caption}</p>
      <div class="pin-meta">
        <button class="pin-like-btn ${p.liked ? 'liked':''}" data-id="${p.id}">&hearts; <span>${p.likes}</span></button>
        <button class="pin-reply-toggle" data-id="${p.id}">${p.replies.length} repl${p.replies.length===1?'y':'ies'}</button>
      </div>
      <div class="pin-thread" data-id="${p.id}">
        ${p.replies.map(r => `<div class="pin-reply"><b>@${r.h}</b> ${r.t}</div>`).join('')}
        <div class="pin-reply-input-row">
          <input type="text" placeholder="reply..." data-id="${p.id}" class="pin-reply-input">
          <button class="pin-reply-send" data-id="${p.id}">Send</button>
        </div>
      </div>
    </article>
  `).join('');

  wall.querySelectorAll('.pin-like-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const pin = pins.find(p=>p.id===btn.dataset.id);
      pin.liked = !pin.liked;
      const delta = pin.liked ? 1 : -1;
      sb.rpc('increment_pin_likes', { p_pin_id: pin.id, p_delta: delta })
        .then(({ data }) => { if (data !== null) pin.likes = data; });
      pin.likes += delta;
      btn.classList.toggle('liked', pin.liked);
      btn.querySelector('span').textContent = pin.likes;
    });
  });
  wall.querySelectorAll('.pin-reply-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const thread = wall.querySelector(`.pin-thread[data-id="${btn.dataset.id}"]`);
      thread.classList.toggle('open');
    });
  });
  wall.querySelectorAll('.pin-reply-send').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const input = wall.querySelector(`.pin-reply-input[data-id="${btn.dataset.id}"]`);
      const text = input.value.trim();
      if (!text) return;
      const pin = pins.find(p=>p.id===btn.dataset.id);
      const handle = (document.getElementById('wgHandle').value.trim() || 'anon').toUpperCase();
      sb.from('pin_replies').insert({ pin_id: pin.id, handle, body: text });
      pin.replies.push({h: handle, t: text});
      const activeZone = document.querySelector('.wg-zone-tab.active').dataset.zone;
      renderWall(activeZone);
    });
  });
}

document.getElementById('wgZones').querySelectorAll('.wg-zone-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.wg-zone-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    renderWall(tab.dataset.zone);
  });
});

let wgMediaData = null;
const wgMediaBtn = document.getElementById('wgMediaBtn');
const wgMediaInput = document.getElementById('wgMediaInput');
wgMediaBtn.addEventListener('click', ()=> wgMediaInput.click());
wgMediaInput.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    wgMediaData = ev.target.result;
    const preview = document.getElementById('wgMediaPreview');
    const img = document.getElementById('wgMediaImg');
    img.src = wgMediaData;
    preview.classList.add('show');
  };
  reader.readAsDataURL(file);
});

document.getElementById('wgPinBtn').addEventListener('click', ()=>{
  const handle = document.getElementById('wgHandle').value.trim() || 'ANON';
  const caption = document.getElementById('wgCaption').value.trim();
  const zone = document.getElementById('wgZoneSelect').value;
  if (!caption && !wgMediaData){
    alert('Add a caption or a photo/video first.');
    return;
  }
  (async () => {
    let mediaUrl = null;
    if (wgMediaData) {
      // Compress images before upload (skip videos)
      let uploadData = wgMediaData;
      const isVideo = wgMediaData.startsWith('data:video');
      if (!isVideo) uploadData = await compressImage(wgMediaData, 1200, 0.82);
      const res = await fetch(uploadData);
      const blob = await res.blob();
      const ext = isVideo ? 'mp4' : 'webp';
      const fileName = 'pin-' + Date.now() + '.' + ext;
      const { data: upData, error: upErr } = await sb.storage.from('pin-media').upload(fileName, blob, { contentType: blob.type, upsert: false });
      if (!upErr) {
        const { data: urlData } = sb.storage.from('pin-media').getPublicUrl(fileName);
        mediaUrl = urlData.publicUrl;
      }
    }
    const { data: newPin, error } = await sb.from('pins').insert({
      handle: handle.toUpperCase(), zone,
      caption: caption || '(no caption)', media_url: mediaUrl
    }).select().single();
    if (error) { alert('Failed to pin: ' + error.message); return; }
    pins.unshift({ id: newPin.id, handle: newPin.handle, zone: newPin.zone,
      caption: newPin.caption, media: mediaUrl || wgMediaData,
      likes: 0, liked: false, replies: [] });
    document.getElementById('wgCaption').value='';
    wgMediaData = null;
    document.getElementById('wgMediaPreview').classList.remove('show');
    renderTicker();
    const activeZone = document.querySelector('.wg-zone-tab.active').dataset.zone;
    renderWall(activeZone);
  })();
});

renderTicker();
renderWall('all');

/* ============ THE ZINE (flipbook) ============ */
const zineSpreads = [
  {num:'01', art:'https://qmztuagvxopahowexrum.supabase.co/storage/v1/object/public/zine-images/zine-spread-01.webp', cap:'The Hero', sub:'Cold-blooded, eagle-free. The crest that started the floor.'},
  {num:'02', art:'https://qmztuagvxopahowexrum.supabase.co/storage/v1/object/public/zine-images/zine-spread-02.webp', cap:'War Time', sub:'Production floor after midnight. No script, no edit.'},
  {num:'03', art:'https://qmztuagvxopahowexrum.supabase.co/storage/v1/object/public/zine-images/zine-spread-03.webp', cap:'Death Corps Capsule', sub:'Cyborg face print, limited run. Sold through the shop above.'},
  {num:'04', art:'https://qmztuagvxopahowexrum.supabase.co/storage/v1/object/public/zine-images/zine-spread-04.webp', cap:'Valhalla Crew', sub:'Warrior flavor for the people who earn their patches.'},
  {num:'05', art:'https://qmztuagvxopahowexrum.supabase.co/storage/v1/object/public/zine-images/zine-spread-05.webp', cap:'The Workbench', sub:'Where the gang sheets get cut and the coffee gets cold.'},
  {num:'06', art:'https://qmztuagvxopahowexrum.supabase.co/storage/v1/object/public/zine-images/zine-spread-06.webp', cap:'Weeklygram Pull', sub:'Best pins from the wall this cycle — go add yours.'},
];

function buildFlipbook(){
  const book = document.getElementById('flipbook');
  book.innerHTML = '';
  zineSpreads.forEach((s, i) => {
    const page = document.createElement('div');
    page.className = 'flip-page';
    page.style.zIndex = zineSpreads.length - i;
    page.innerHTML = `
      <div class="page-face front">
        <span class="page-spread-num">Spread ${s.num}</span>
        <div class="page-art"><img src="${s.art}" alt="${s.cap}" loading="lazy"></div>
        <div class="page-cap">${s.cap}</div>
        <div class="page-sub">${s.sub}</div>
      </div>
      <div class="page-face back">
        <span class="page-spread-num">Issue 01</span>
        <div class="page-art" style="display:flex;align-items:center;justify-content:center;color:var(--bone-dim);background:#0d0c0a;">
          <span style="font-family:var(--display);font-size:13px;letter-spacing:0.1em;text-transform:uppercase;">Skrew U</span>
        </div>
        <div class="page-cap">Turn back &rarr;</div>
      </div>
    `;
    page.addEventListener('click', ()=> handlePageClick(i));
    book.appendChild(page);
  });
  updateZineState();
}

let zinePage = 0; // number of pages flipped
function handlePageClick(i){
  if (i === zinePage) flipNext();
  else if (i === zinePage - 1) flipPrev();
}
function flipNext(){
  if (zinePage >= zineSpreads.length) return;
  const pages = document.querySelectorAll('.flip-page');
  pages[zinePage].classList.add('flipped');
  zinePage++;
  updateZineState();
}
function flipPrev(){
  if (zinePage <= 0) return;
  zinePage--;
  const pages = document.querySelectorAll('.flip-page');
  pages[zinePage].classList.remove('flipped');
  updateZineState();
}
function updateZineState(){
  document.getElementById('zineCount').textContent = `Spread ${Math.min(zinePage+1, zineSpreads.length)} / ${zineSpreads.length}`;
  document.getElementById('zinePrev').disabled = zinePage === 0;
  document.getElementById('zineNext').disabled = zinePage >= zineSpreads.length;
}
document.getElementById('zineNext').addEventListener('click', flipNext);
document.getElementById('zinePrev').addEventListener('click', flipPrev);
buildFlipbook();

/* ============ FREQUENCY (mock player) ============ */
(function(){
  const playBtn = document.getElementById('freqPlayBtn');
  const fill = document.getElementById('freqProgressFill');
  const timeEl = document.getElementById('freqTime');
  const disc = document.getElementById('freqDisc');
  const DURATION = 30; // mock seconds for demo purposes — no real audio yet
  let elapsed = 0, playing = false, timer = null;

  function fmt(s){ const m = Math.floor(s/60); const ss = Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${ss}`; }
  function render(){
    fill.style.width = (elapsed/DURATION*100) + '%';
    timeEl.textContent = `${fmt(elapsed)} / ${fmt(DURATION)}`;
  }
  playBtn.addEventListener('click', ()=>{
    playing = !playing;
    playBtn.innerHTML = playing ? '&#10073;&#10073;' : '&#9658;';
    disc.classList.toggle('spinning', playing);
    if (playing){
      timer = setInterval(()=>{
        elapsed += 1;
        if (elapsed >= DURATION){
          elapsed = DURATION; playing = false;
          playBtn.innerHTML = '&#9658;'; disc.classList.remove('spinning');
          clearInterval(timer);
        }
        render();
      }, 1000);
    } else {
      clearInterval(timer);
    }
  });
  render();
})();

/* ============ LIVE / ON THE FLOOR ============ */
document.querySelectorAll('.live-dest-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.live-dest-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    // Status stays offline by default until wired to a real stream-status endpoint.
    // Swapping destination just changes which embed would load when live.
  });
});

(function(){
  const canvas = document.getElementById('liveNoiseCanvas');
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize(){ canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; }
  window.addEventListener('resize', resize);
  resize();
  function drawNoise(){
    const w = canvas.width, h = canvas.height;
    const imgData = ctx.createImageData(w, h);
    for (let i=0; i<imgData.data.length; i+=4){
      const v = Math.random()*255;
      imgData.data[i] = v; imgData.data[i+1] = v; imgData.data[i+2] = v; imgData.data[i+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    if (!reduced) requestAnimationFrame(drawNoise);
  }
  if (!reduced) requestAnimationFrame(drawNoise);
  else { ctx.fillStyle = '#111'; ctx.fillRect(0,0,canvas.width,canvas.height); }
})();

/* ============ JOIN ============ */
document.getElementById('joinForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('.join-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  fetch(form.action, {
    method: 'POST',
    body: new FormData(form),
    headers: { 'Accept': 'application/json' }
  })
  .then(response => {
    if (response.ok){
      form.style.display = 'none';
      document.getElementById('joinConfirm').classList.add('show');
    } else {
      throw new Error('Submission failed');
    }
  })
  .catch(() => {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send It';
    alert("Something went wrong sending that — mind trying again in a second?");
  });
});

/* ============ THE SHOP ============
   The retail shelf, above Customs. This used to be a separate site on Manus;
   it is a section here now, reading shirts.json at load so adding a shirt is
   editing one file and nothing else.

   Buying is a Stripe Payment Link per shirt — the same way the tools are sold.
   That needs no secret key and no server, which is the whole reason it works
   today. Sizes belong on the Link as a Stripe custom field, not in here. */
async function loadStore() {
  const grid = document.getElementById('storeGrid');
  const empty = document.getElementById('storeEmptyState');
  const note = document.getElementById('storeNote');
  if (!grid) return;

  let data;
  try {
    const res = await fetch('shirts.json', { cache: 'no-store' });
    data = await res.json();
  } catch {
    // A shelf that failed to load is not an empty shelf, and saying "nothing
    // here" would be a lie that costs a sale.
    if (empty) empty.innerHTML = '<h3>Shop didn’t load.</h3><p>Give it a refresh.</p>';
    return;
  }

  const shirts = (data && data.shirts) || [];
  if (!shirts.length) return;               // leave the empty state as written
  if (empty) empty.remove();

  grid.innerHTML = shirts.map(s => {
    const price = Number(s.price || 0);
    const buyable = !s.sold && s.paymentLink;
    const label = s.sold ? 'Sold out' : s.paymentLink ? 'Buy' : 'Soon';
    return `
      <div class="product-card${s.sold ? ' store-sold' : ''}">
        <div class="product-art">
          ${s.sold ? '<span class="store-flag">Sold out</span>' : ''}
          ${s.image ? `<img src="${esc(s.image)}" alt="${esc(s.name || '')}" loading="lazy">` : ''}
        </div>
        <div class="store-body">
          <div class="store-name">${esc(s.name || 'Untitled')}</div>
          <div class="store-blurb">${esc(s.blurb || '')}</div>
          <div class="store-row">
            <span class="store-price">$${price.toFixed(0)}</span>
            <button class="store-buy" type="button"${buyable ? ` data-buy="${esc(s.paymentLink)}"` : ' disabled'}>${label}</button>
          </div>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-buy]').forEach(b =>
    b.addEventListener('click', () => { location.href = b.dataset.buy; }));

  // Say plainly how much of the shelf can actually be bought, rather than
  // letting a shopper find out one dead button at a time.
  const ready = shirts.filter(s => s.paymentLink && !s.sold).length;
  const live = shirts.filter(s => !s.sold).length;
  if (note) {
    note.textContent = ready === live
      ? 'Card checkout by Stripe.'
      : `${ready} of ${live} ready to buy — the rest need a Stripe Payment Link in shirts.json.`;
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

loadStore();

// Copy this module into the designer's own public assets. No API keys belong here.
const maxBytes = 4 * 1024 * 1024;
const identifier = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function label(value, max) {
  requireValue(value == null || typeof value === 'string', 'Check the design details.');
  const clean = (value || '').trim();
  requireValue(clean.length <= max, 'The design details are too long.');
  return clean;
}
function printDetails(print) {
  requireValue(print && ['front', 'back', 'left sleeve', 'right sleeve'].includes(print.placement), 'Choose the print placement.');
  for (const key of ['width_inches', 'height_inches']) requireValue(typeof print[key] === 'number' && Number.isFinite(print[key]) && print[key] > 0 && print[key] <= 60,
    'Set the print width and height in inches.');
  return { placement: print.placement, width_inches: print.width_inches, height_inches: print.height_inches };
}
function printFile(file) {
  requireValue(file instanceof Blob && file.size > 0 && file.size <= maxBytes,
    'Send a shirt preview and original print files, each no larger than 4 MB.');
  requireValue(['image/png', 'image/jpeg', 'image/webp'].includes(file.type), 'Use PNG, JPG, or WebP files.');
  return file;
}
export function readDesignTransfer(data) {
  requireValue(data?.type === 'skrewu:design' && data.version === 1 && identifier(data.transfer_id), 'Invalid design transfer.');
  const preview = printFile(data.preview), artwork = printFile(data.artwork), print = printDetails(data.print);
  const intent = data.intent ?? 'review';
  requireValue(['review', 'publish'].includes(intent), 'Choose a valid shop action.');
  requireValue(data.additional_prints == null || (Array.isArray(data.additional_prints) && data.additional_prints.length <= 3), 'Use no more than four print placements.');
  const placements = new Set([print.placement]);
  const additional_prints = (data.additional_prints || []).map(item => {
    const detail = printDetails(item?.print);
    requireValue(!placements.has(detail.placement), 'Use one print file per placement.'); placements.add(detail.placement);
    return { artwork: printFile(item.artwork), print: detail };
  });
  requireValue(data.variants == null || Array.isArray(data.variants), 'Check the shirt options.');
  requireValue((data.variants || []).length <= 100, 'Use no more than 100 shirt options.');
  const seen = new Set();
  const variants = (data.variants || []).map(v => {
    const size = label(v?.size, 20), color = label(v?.color, 40);
    const key = `${size.toLowerCase()}|${color.toLowerCase()}`;
    requireValue(size && color && !seen.has(key), 'Use unique size and color combinations.'); seen.add(key);
    requireValue(v.available == null || typeof v.available === 'boolean', 'Check option availability.');
    return { size, color, available: v.available ?? true };
  });
  if (data.price_cents != null) requireValue(Number.isInteger(data.price_cents) && data.price_cents >= 100 && data.price_cents <= 100000,
    'Price must be $1–$1,000.');
  const name = label(data.name, 100), description = label(data.description, 3000), garment = label(data.garment, 1000);
  if (intent === 'publish') requireValue(name && description && garment && data.price_cents != null && variants.some(v => v.available),
    'Add a title, description, garment, price and available sizes/colors before publishing.');
  return { name, description, garment, intent, additional_prints,
    price_cents: data.price_cents, variants, preview, artwork,
    design_spec: { transfer_id: data.transfer_id, source_design_id: label(data.source_design_id, 100),
      placement: print.placement, width_inches: print.width_inches, height_inches: print.height_inches } };
}

// Call directly from the Sell this design button. Opening first preserves the
// user gesture while the editor asynchronously renders its two export files.
export function openShopDraft({ getDesign, shopUrl = 'https://skrewu-shop.netlify.app', timeoutMs = 300000, intent = 'review' } = {}) {
  requireValue(typeof getDesign === 'function', 'Connect the designer export first.');
  requireValue(['review', 'publish'].includes(intent), 'Choose a valid shop action.');
  const target = new URL('/owner.html', shopUrl);
  requireValue(target.protocol === 'https:' || (target.protocol === 'http:' && target.hostname === '127.0.0.1'), 'Use the secure shop URL.');
  const transferId = crypto.randomUUID();
  target.hash = new URLSearchParams({ transfer: transferId, designer: window.location.origin, intent }).toString();
  const popup = window.open(target.href, '_blank');
  requireValue(popup, 'Allow the designer to open the shop window, then try again.');
  return new Promise((resolve, reject) => {
    let sent = false, active = true;
    const cleanup = () => { active = false; clearTimeout(timer); clearInterval(closed); window.removeEventListener('message', onMessage); };
    const fail = error => { cleanup(); reject(error); };
    async function onMessage(event) {
      if (!active || event.source !== popup || event.origin !== target.origin || event.data?.transfer_id !== transferId) return;
      if (event.data.type === 'skrewu:received') {
        if (!sent) return;
        if (intent === 'publish' && (event.data.status !== 'published' || event.data.product_id !== transferId)) {
          fail(new Error('The shop has not confirmed publication. Check the shop window before trying again.')); return;
        }
        cleanup(); resolve({ status: intent === 'publish' ? 'published' : 'review', transfer_id: transferId,
          ...(intent === 'publish' ? { product_id: transferId } : {}) }); return;
      }
      if (event.data.type === 'skrewu:error') { fail(new Error(label(event.data.message, 500) || 'The shop could not receive the design.')); return; }
      if (event.data.type !== 'skrewu:ready' || sent) return;
      if (intent === 'publish' && !event.data.capabilities?.includes('publish')) {
        fail(new Error('Update the SKREWU shop connection before publishing from this designer.')); return;
      }
      sent = true;
      try {
        const payload = { ...(await getDesign()), intent, type: 'skrewu:design', version: 1, transfer_id: transferId };
        if (!active || popup.closed) return;
        readDesignTransfer(payload);
        popup.postMessage(payload, target.origin);
      } catch (error) { fail(error); }
    }
    const timer = setTimeout(() => fail(new Error('The transfer timed out. Your design is still in the editor.')), timeoutMs);
    const closed = setInterval(() => { if (popup.closed) fail(new Error('The shop window closed before receiving the design.')); }, 1000);
    window.addEventListener('message', onMessage);
  });
}

export function publishToShop(options) { return openShopDraft({ ...options, intent: 'publish' }); }

export function acceptsDesignMessage(event, connection) {
  return Boolean(connection.opener && event.source === connection.opener && connection.origins.includes(event.origin)
    && event.origin === connection.designerOrigin && event.data?.transfer_id === connection.transferId && identifier(connection.transferId));
}

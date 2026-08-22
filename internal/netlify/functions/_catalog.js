/**
 * _catalog — the price list, as the server sees it.
 *
 * Tools live in products.json and art packs in packs.json, both at the repo
 * root, and both sell through the same checkout. The amount charged is read
 * from here and never from the browser, so a tampered request can't set its
 * own price.
 *
 * These are `require`d, not read off the disk at runtime. That distinction is
 * the whole reason this file exists. The functions are bundled with esbuild,
 * which ships the JavaScript a function reaches and nothing else — the site's
 * static files are published to the CDN, not into the bundle. So a runtime
 * fs.readFileSync('products.json') found nothing, in a deployed function,
 * every time. Both the store and the payment webhook did exactly that: the
 * store answered "Could not read the product catalog" on the first real
 * customer, and the webhook would have taken a payment and then failed to name
 * what was bought.
 *
 * A static require is resolved at build time and the contents end up inside
 * the bundle, so there is no file to find.
 *
 * The disk read is kept as a fallback, and netlify.toml lists both files under
 * included_files so they are there if it's ever needed. Two mechanisms for one
 * job is usually a smell, but not here: the failure being guarded against is
 * silent, only happens in a deployed function, and takes the store down for a
 * paying customer. Either path working is enough.
 */

const fs = require('fs');
const path = require('path');

function load(name, inlined) {
  if (inlined && (inlined.products || inlined.packs)) return inlined;
  for (const p of [path.join(__dirname, '../../' + name), path.join(process.cwd(), name)]) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  }
  return {};
}

let inlinedProducts = null;
let inlinedPacks = null;
try { inlinedProducts = require('../../products.json'); } catch {}
try { inlinedPacks = require('../../packs.json'); } catch {}

const products = load('products.json', inlinedProducts);
const packs = load('packs.json', inlinedPacks);

const CURRENCY = products.currency || packs.currency || 'usd';

/* Art packs are always a single purchase; tools can be a subscription, and say
   so in their own record. */
function all() {
  return [
    ...(products.products || []),
    ...((packs.packs || []).map((p) => ({ ...p, billing: p.billing || 'one-time' }))),
  ];
}

function byId(id) {
  if (!id) return null;
  return all().find((p) => p.id === id) || null;
}

module.exports = { CURRENCY, all, byId };

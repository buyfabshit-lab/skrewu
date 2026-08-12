/**
 * _credits — the wallet, shared by every function that spends or sells credits.
 *
 * There was already a credit system here: packs, plans, a ledger that records
 * every movement with the balance after it, and generations that record what
 * each run cost. It was built around an email account. This platform has no
 * accounts — a link is the credential — so a wallet can now belong to a tenant
 * instead, and the rest of that design is used exactly as it was.
 *
 * The rules that matter:
 *   - The price of a run lives here and nowhere else, so the page that quotes
 *     it and the server that charges it can never disagree.
 *   - Spending is one statement in the database. Two tabs generating at the
 *     same moment cannot both pass a balance check and overdraw.
 *   - A purchase is idempotent on the Stripe event id, so a redelivered
 *     webhook adds credits once.
 *   - A failed run is refunded. Nobody pays for something they didn't get.
 */

/* What a run costs. Kept as data, not scattered through the callers. */
const PRICES = {
  image: { '1K': 20, '2K': 30 },
  video: { '5': 200, '10': 400 },
};

function priceOf(kind, variant) {
  const table = PRICES[kind === 'video' ? 'video' : 'image'];
  return table[String(variant)] || Object.values(table)[0];
}

function missingEnv(names) {
  return names.filter((n) => !process.env[n]);
}

async function sb(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key, Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json', ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) throw new Error((data && (data.message || data.hint)) || `database error ${res.status}`);
  return data;
}

const rpc = (fn, args) => sb('rpc/' + fn, { method: 'POST', body: JSON.stringify(args) });

/* Constant-time, so a wrong key can't be found one character at a time. */
function keyMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Who's asking, proved the same way every other guarded door proves it. */
async function whoIsAsking(slug, key) {
  const who = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!who) return { error: 'Which shop?', status: 400 };
  const rows = await sb(`tenants?slug=eq.${encodeURIComponent(who)}&select=slug,name,access_key,active`);
  const t = rows && rows[0];
  if (!t || !t.active) return { error: 'No such shop', status: 404 };
  if (!keyMatches(String(key || ''), t.access_key)) return { error: 'Not your shop', status: 401 };
  return { tenant: { slug: t.slug, name: t.name } };
}

/* The wallet, made on first sight so nobody has to sign up for one. */
async function walletFor(slug) {
  const id = await rpc('ms_wallet_for_tenant', { p_slug: slug });
  if (!id) throw new Error('Could not open a wallet for ' + slug);
  const rows = await sb(`ms_users?id=eq.${encodeURIComponent(id)}&select=id,credits_balance,credits_used,plan_id`);
  return rows && rows[0];
}

/* Returns the new balance, or null when there wasn't enough — in which case
   the caller must refuse the work rather than do it for free. */
async function spend(walletId, amount, why) {
  const after = await rpc('ms_spend', { p_user: walletId, p_amount: amount, p_why: why });
  return after === -1 || after === null ? null : after;
}

async function grant(walletId, amount, type, why, stripeEvent) {
  return await rpc('ms_grant', {
    p_user: walletId, p_amount: amount, p_type: type, p_why: why, p_event: stripeEvent || null,
  });
}

async function refund(walletId, amount, why) {
  return await rpc('ms_refund', { p_user: walletId, p_amount: amount, p_why: why });
}

async function packs() {
  return await sb('ms_credit_packs?active=is.true&select=id,credits,price,savings_pct&order=price.asc');
}

async function packById(id) {
  const rows = await sb(`ms_credit_packs?id=eq.${encodeURIComponent(String(id))}&active=is.true&select=id,credits,price`);
  return rows && rows[0];
}

/* What a run cost and how it went — the same table the older site writes to. */
async function recordRun(walletId, kind, credits, params, extra = {}) {
  const rows = await sb('ms_generations', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: walletId, type: kind, status: 'processing',
      credits_used: credits, input_params: params, ...extra,
    }),
  });
  return rows && rows[0] && rows[0].id;
}

async function finishRun(id, patch) {
  if (!id) return;
  await sb(`ms_generations?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

module.exports = {
  PRICES, priceOf, missingEnv, sb, rpc,
  whoIsAsking, walletFor, spend, grant, refund,
  packs, packById, recordRun, finishRun,
};

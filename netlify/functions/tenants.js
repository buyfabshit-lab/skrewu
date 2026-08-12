/**
 * tenants — setting somebody up.
 *
 * The owner's side of the house: make a space for a new person, choose the face
 * they'll see, pick which tools they get, and hand them a link.
 *
 * This is the most sensitive endpoint here, because it mints access. Four rules
 * hold it together, and none of them should be relaxed:
 *
 *  1. The caller proves who they are with their own access key, same as
 *     everywhere else.
 *  2. Only an owner or a partner may set anyone up. A client cannot.
 *  3. A new space is always parented to the caller and always `client`. Neither
 *     comes from the request, so nobody can mint a peer, a parent, or an owner.
 *  4. You only ever see and change your own people — every read and write is
 *     filtered by `parent_slug = caller`. A partner setting up their clients
 *     cannot see another partner's.
 *
 * A child's access key IS returned, because the whole job is handing somebody
 * their link. The caller has already proved they own that child. The caller's
 * own key is never echoed back.
 *
 * Netlify environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * POST { action, who, key, ... }
 *   list                                    -> your people
 *   create { name, slug?, theme?, tools? }  -> a new space + its link
 *   update { slug, theme?, tools?, active? }-> change one of yours
 */

const SAFE = 'slug,name,kind,parent_slug,access_key,branding,tools,shop,active,created_at';

/* The faces a space can wear. Anything else is refused rather than stored, so a
   typo can't leave somebody staring at an unstyled page. */
const FACES = ['skrewu', 'pro', 'sport', 'tropical', 'critters'];

/* What can be switched on for a space. Same reasoning. */
const TOOLS = ['locker', 'shirts', 'gangsheet', 'sticker', 'blanks', 'omniflow', 'wholesale', 'live'];

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

function keyMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const slugify = (s) => String(s || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { ok: false, error: 'Server not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }

  const who = slugify(body.who);
  const key = String(body.key || '');
  if (!who) return json(400, { ok: false, error: 'Who are you?' });

  let me;
  try {
    const rows = await sb(`tenants?slug=eq.${encodeURIComponent(who)}&select=${SAFE}`);
    me = rows && rows[0];
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
  if (!me || !me.active) return json(404, { ok: false, error: 'No such account' });
  if (!keyMatches(key, me.access_key)) return json(401, { ok: false, error: 'That link isn’t valid.' });
  if (me.kind !== 'owner' && me.kind !== 'partner') {
    return json(403, { ok: false, error: 'Only an owner or a partner can set people up.' });
  }

  const mine = `parent_slug=eq.${encodeURIComponent(me.slug)}`;
  const action = String(body.action || 'list');

  try {
    if (action === 'list') {
      const kids = await sb(`tenants?${mine}&select=${SAFE}&order=created_at.desc`);
      return json(200, {
        ok: true,
        me: { slug: me.slug, name: me.name, kind: me.kind },
        faces: FACES, tools: TOOLS,
        people: kids || [],
      });
    }

    if (action === 'create') {
      const name = String(body.name || '').trim().slice(0, 80);
      if (!name) return json(400, { ok: false, error: 'They need a name.' });
      const slug = slugify(body.slug || name);
      if (!slug) return json(400, { ok: false, error: 'That name doesn’t make a usable link.' });

      const clash = await sb(`tenants?slug=eq.${encodeURIComponent(slug)}&select=slug`);
      if (clash && clash.length) return json(409, { ok: false, error: `“${slug}” is taken — try another name.` });

      const theme = FACES.includes(body.theme) ? body.theme : 'pro';
      const tools = Array.isArray(body.tools) ? body.tools.filter(t => TOOLS.includes(t)) : ['locker', 'shirts', 'gangsheet'];

      const created = await sb('tenants', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          slug, name,
          kind: 'client',            // never from the request
          parent_slug: me.slug,      // never from the request
          tools,
          branding: {},
          shop: { theme },
          active: true,
        }),
      });
      return json(200, { ok: true, person: created && created[0] });
    }

    if (action === 'update') {
      const slug = slugify(body.slug);
      if (!slug) return json(400, { ok: false, error: 'Which person?' });

      const patch = {};
      if (body.theme !== undefined) {
        if (!FACES.includes(body.theme)) return json(400, { ok: false, error: 'Unknown face' });
        // merge, so setting a face doesn't wipe their shop domain or variants
        const rows = await sb(`tenants?slug=eq.${encodeURIComponent(slug)}&${mine}&select=shop`);
        if (!rows || !rows.length) return json(404, { ok: false, error: 'Not one of yours' });
        patch.shop = { ...(rows[0].shop || {}), theme: body.theme };
      }
      if (Array.isArray(body.tools)) patch.tools = body.tools.filter(t => TOOLS.includes(t));
      if (typeof body.active === 'boolean') patch.active = body.active;
      if (!Object.keys(patch).length) return json(400, { ok: false, error: 'Nothing to change' });

      // the parent filter is what stops one partner editing another's client
      const updated = await sb(`tenants?slug=eq.${encodeURIComponent(slug)}&${mine}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (!updated || !updated.length) return json(404, { ok: false, error: 'Not one of yours' });
      return json(200, { ok: true, person: updated[0] });
    }

    return json(400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
};

/**
 * generate — one door for making images and video from a prompt.
 *
 * The AI Image and AI Video tools both call here. The provider key stays on
 * the server; the browser sends a prompt and settings, never a key.
 *
 * Every run costs credits, so every run has to say who it's for. The shop
 * proves itself the same way it does at a locker, the cost is taken before the
 * work starts, and it's given back if the work fails — nobody pays for
 * something they didn't get. Without that, this endpoint spends real money for
 * anyone who finds the URL.
 *
 * Two providers can stand behind the image side of this door:
 *
 *   Higgsfield — Marketing Studio Image. Campaign pictures from a prompt, or
 *     from a product photo and an optional model reference pulled out of the
 *     shop's own locker, with a preset deciding the look. 1K, 2K or 4K. It is
 *     a queue: the request comes back with a ticket, and the browser polls the
 *     ticket until the picture exists. Used for images when HF_KEY is set.
 *
 *   fal.ai — one key covers image models and video models both. It is what
 *     makes images when there is no HF_KEY, and it is still the only thing
 *     that makes video.
 *
 * Netlify environment variables:
 *   HF_KEY             Higgsfield, as KEY_ID:KEY_SECRET — switches images over
 *   FAL_KEY            fal.ai — video, and images when there's no HF_KEY
 *   GEN_IMAGE_PROVIDER optional — 'higgsfield' or 'fal' to force one
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GEN_IMAGE_MODEL    optional — default marketing-studio/image on Higgsfield,
 *                      fal-ai/flux/schnell on fal
 *   GEN_VIDEO_MODEL    optional — default fal-ai/kling-video/v1.6/standard/text-to-video
 *
 * GET                          → { ok, ready, image:{…}, video:{…} }
 *                                 what's switched on, and what the image side
 *                                 can take (aspects, resolutions, presets…)
 * GET ?presets=1&who&k         → { ok, presets:[{id,name}] }   the catalog
 * POST { who, k, kind:'image', prompt, aspect, resolution, batch }
 *                              → { ok, images:[url], saved:[url], balance }   fal, straight back
 *                              → { ok, job, run, balance }                     Higgsfield, a ticket
 * POST { who, k, kind:'image', job, run }
 *                              → { ok, status } | { ok, done:true, images, saved }
 * POST { who, k, kind:'video', prompt, aspect, duration }
 *                              → { ok, job, balance }   video takes minutes
 * POST { who, k, kind:'video', job }
 *                              → { ok, status } | { ok, done:true, url }
 */

const C = require('./_credits');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

/* ---- which provider makes the image ----
 *
 * Setting HF_KEY is enough to switch images to Higgsfield; GEN_IMAGE_PROVIDER
 * forces it either way, for the day both keys are set and one of them is
 * misbehaving. Video is fal regardless — Higgsfield's image endpoint doesn't
 * make video, and pretending otherwise would just be a slower way of saying no.
 */
function imageProvider() {
  const forced = String(process.env.GEN_IMAGE_PROVIDER || '').toLowerCase();
  if (forced === 'higgsfield' || forced === 'fal') return forced;
  return process.env.HF_KEY ? 'higgsfield' : 'fal';
}
function imageKeyPresent() {
  return imageProvider() === 'higgsfield' ? !!process.env.HF_KEY : !!process.env.FAL_KEY;
}

const HF_BASE = 'https://api.higgsfield.ai';
const HF_IMAGE_MODEL = () => process.env.GEN_IMAGE_MODEL || 'marketing-studio/image';
const FAL_IMAGE_MODEL = () => process.env.GEN_IMAGE_MODEL || 'fal-ai/flux/schnell';
const VIDEO_MODEL = () => process.env.GEN_VIDEO_MODEL || 'fal-ai/kling-video/v1.6/standard/text-to-video';

/* The shapes each provider actually takes. fal is given a width and height so
   it takes anything; Higgsfield has its own list, and 5:4 / 4:5 aren't on it. */
const FAL_ASPECTS = {
  '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '21:9': [21, 9],
  '4:3': [4, 3], '3:4': [3, 4], '3:2': [3, 2], '2:3': [2, 3],
  '5:4': [5, 4], '4:5': [4, 5],
};
const HF_ASPECTS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'];

const FAL_RESOLUTIONS = ['1K', '2K'];
const HF_RESOLUTIONS = ['1K', '2K', '4K'];

/* What the page needs to know to draw its settings sheet honestly: which
   shapes, which sizes, whether it can batch, whether presets and reference
   photos mean anything here. The page never guesses at this. */
function imageCapabilities() {
  const hf = imageProvider() === 'higgsfield';
  return {
    provider: hf ? 'higgsfield' : 'fal',
    ready: !!(imageKeyPresent() && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    aspects: hf ? HF_ASPECTS : Object.keys(FAL_ASPECTS),
    resolutions: hf ? HF_RESOLUTIONS : FAL_RESOLUTIONS,
    batch: !hf,             // Higgsfield makes one picture per request
    presets: hf,            // campaign presets, from the catalog
    references: hf,         // a product photo and a model reference
    queued: hf,             // a ticket to poll rather than an answer
  };
}

function sizeFor(aspect, resolution) {
  const [aw, ah] = FAL_ASPECTS[aspect] || FAL_ASPECTS['1:1'];
  const long = resolution === '2K' ? 1920 : 1024;
  const scale = long / Math.max(aw, ah);
  const r8 = (n) => Math.max(256, Math.round((n * scale) / 8) * 8);
  return { width: r8(aw), height: r8(ah) };
}

/* One shape of call to each provider, with the key added here and nowhere
   else, and the provider's own error message surfaced when it has one. */
async function provider(url, auth, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const msg = (data && ((data.detail && JSON.stringify(data.detail)) || data.message || data.error))
      || `provider error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
const fal = (url, opts) => provider(url, 'Key ' + process.env.FAL_KEY, opts);
const hf = (url, opts) => provider(url, 'Key ' + process.env.HF_KEY, opts);

/* ---- the preset catalog ----
 *
 * Presets live in Higgsfield's own catalog and come and go there, so they are
 * fetched, never written down. Each shop sees the same list; it's held in
 * memory for a few minutes so the sheet opens quickly and the provider isn't
 * asked the same question on every tap. A stale list for ten minutes costs
 * nothing — a preset that has just vanished is refused by the provider, and
 * the run is refunded like any other failure.
 */
let presetCache = { at: 0, items: [] };
const PRESET_TTL = 10 * 60 * 1000;

async function presetCatalog() {
  if (Date.now() - presetCache.at < PRESET_TTL && presetCache.items.length) return presetCache.items;
  const items = [];
  let cursor = null;
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ size: '50' });
    if (cursor) q.set('cursor', cursor);
    const data = await hf(`${HF_BASE}/${HF_IMAGE_MODEL()}/presets?${q}`);
    for (const it of (data && data.items) || []) {
      if (it && it.id) items.push({ id: String(it.id), name: String(it.name || 'Preset'), type: it.type || '' });
    }
    cursor = data && data.cursor;
    if (!cursor) break;
  }
  presetCache = { at: Date.now(), items };
  return items;
}

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

/* Reference photos travel as links the provider fetches for itself. They have
   to be real web addresses, and there's a ceiling so a request can't be a
   list of a thousand of them. The page offers the shop's own locker; anything
   else that's https is still allowed, because a product shot might live on
   the shop's storefront instead. */
function cleanImageUrls(list, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const u of list) {
    const s = String(u || '').trim();
    if (!/^https:\/\/[^\s"'<>]+$/i.test(s) || s.length > 2000) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/* ---- keeping what you made ----
 *
 * A generated image used to be handed back as a link on the provider's server
 * and nothing else. To use it for anything you had to download it and upload it
 * again by hand, and provider links don't live forever — so the tool made
 * things that went nowhere and then expired.
 *
 * Now the file is copied into the shop's own storage and filed in its locker,
 * which is the same place a logo goes when it's dragged in. From there it
 * drops onto a shirt or packs into a sheet like anything else. That single hop
 * is what turns the AI tools from a side room into part of the line.
 *
 * It is deliberately not allowed to fail the run. The image was made and the
 * credits were spent; a storage hiccup afterwards is not a reason to refuse
 * what somebody paid for. If filing fails the picture still comes back, and
 * the reply says plainly that it wasn't saved rather than quietly implying it
 * was.
 */
const LOCKER_BUCKET = 'listing-photos';

async function fileInLocker(slug, imageUrl, prompt) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`could not fetch the image back (${res.status})`);
  const type = res.headers.get('content-type') || 'image/png';
  const bytes = Buffer.from(await res.arrayBuffer());

  const ext = /jpe?g/.test(type) ? 'jpg' : /webp/.test(type) ? 'webp' : 'png';
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const path = `ai/${slug}/${stamp}.${ext}`;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const up = await fetch(`${url}/storage/v1/object/${LOCKER_BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': type },
    body: bytes,
  });
  if (!up.ok) throw new Error(`storage refused it (${up.status})`);

  const publicUrl = `${url}/storage/v1/object/public/${LOCKER_BUCKET}/${path}`;

  /* The prompt becomes the name, trimmed — it's what you'd have called it
     anyway, and a locker full of "untitled" is a locker you can't search. */
  const name = (String(prompt || '').trim().slice(0, 60) || 'AI image');

  const ins = await fetch(`${url}/rest/v1/locker_logos`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    // Both ownership columns, in step, exactly as the locker door writes them.
    body: JSON.stringify({
      tenant_slug: slug, owner_slug: slug,
      name, url: publicUrl, storage_path: path,
    }),
  });
  if (!ins.ok) throw new Error(`could not file it (${ins.status})`);

  return publicUrl;
}

/* Every finished picture goes through this: file the copies, never fail. */
async function keepAll(slug, images, prompt) {
  const saved = [];
  let saveError = null;
  for (const src of images) {
    try { saved.push(await fileInLocker(slug, src, prompt)); }
    catch (e) { saveError = String(e.message || e); }
  }
  return { saved, savedCount: saved.length, ...(saveError ? { saveError } : {}) };
}

/* ---- a ticket, and whose it is ----
 *
 * A queued image comes back later, and the browser asks after it by ticket.
 * The ticket is the run's own row: it holds what was charged and where the
 * provider said to look, so the browser can't quote a refund of its own
 * choosing, and a ticket from one shop is simply not found by another. The
 * place to look is kept exactly as the provider gave it rather than rebuilt
 * from a pattern, and checked to be the provider's own address before the key
 * is ever sent to it.
 */
async function runOwnedBy(runId, walletId) {
  const id = String(runId || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!id) return null;
  const rows = await C.sb(
    `ms_generations?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(walletId)}` +
    `&select=id,status,credits_used,input_params,output_url,hedra_gen_id`
  );
  return rows && rows[0];
}

function providerStatusUrl(run) {
  const meta = (run && run.input_params && run.input_params._provider) || {};
  const u = String(meta.status_url || '');
  if (u.startsWith(HF_BASE + '/')) return u;
  // Nothing recorded — fall back to the queue's standard address for the ticket.
  const id = String(run && run.hedra_gen_id || '').replace(/[^a-zA-Z0-9-]/g, '');
  return id ? `${HF_BASE}/requests/${id}/status` : null;
}

exports.handler = async (event) => {
  const db = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const image = imageCapabilities();
  const video = { ready: !!(process.env.FAL_KEY && db) };
  const q = event.queryStringParameters || {};

  if (event.httpMethod === 'GET' && !q.presets) {
    return json(200, { ok: true, ready: image.ready || video.ready, image, video });
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  const gone = C.missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (gone.length) {
    return json(500, { ok: false, error: 'Server not configured: missing ' + gone.join(' and ') + ' in Netlify.' });
  }

  let body = {};
  if (event.httpMethod === 'POST') {
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }
  } else {
    body = { who: q.who || q.shop, k: q.k, presets: true };
  }

  /* Who's paying. Every run is charged, so every run needs an owner — and the
     catalog goes out under the shop's own key too, because asking for it
     spends the provider's patience on this door's behalf. */
  let me, wallet;
  try {
    me = await C.whoIsAsking(body.who || body.shop, body.k);
    if (me.error) return json(me.status, { ok: false, error: me.error });
    wallet = await C.walletFor(me.tenant.slug);
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }

  /* The preset catalog. Only means anything with Higgsfield behind the door. */
  if (body.presets && event.httpMethod === 'GET') {
    if (!image.presets) return json(200, { ok: true, presets: [] });
    if (!process.env.HF_KEY) return json(400, { ok: false, error: 'Not connected yet — set HF_KEY in Netlify.' });
    try { return json(200, { ok: true, presets: await presetCatalog() }); }
    catch (e) { return json(502, { ok: false, error: String(e.message || e) }); }
  }

  const kind = body.kind === 'video' ? 'video' : 'image';

  if (kind === 'image' && !imageKeyPresent()) {
    return json(400, {
      ok: false,
      error: image.provider === 'higgsfield'
        ? 'Not connected yet — set HF_KEY in Netlify (Higgsfield → API keys, as KEY_ID:KEY_SECRET).'
        : 'Not connected yet — set FAL_KEY in Netlify (fal.ai → dashboard → keys).',
    });
  }
  if (kind === 'video' && !process.env.FAL_KEY) {
    return json(400, { ok: false, error: 'Not connected yet — set FAL_KEY in Netlify (fal.ai → dashboard → keys).' });
  }

  /* Checking on a video that's already cooking. Already paid for, so this
     costs nothing — but it still had to prove whose job it is. */
  if (kind === 'video' && body.job) {
    const id = String(body.job).replace(/[^a-zA-Z0-9-]/g, '');
    try {
      const st = await fal(`https://queue.fal.run/${VIDEO_MODEL()}/requests/${id}/status`);
      if (st.status === 'FAILED' || st.status === 'ERROR') {
        const back = await C.refund(wallet.id, Number(body.charged) || 0, 'Video failed');
        await C.finishRun(body.run, { status: 'failed', error_message: 'provider reported failure' });
        return json(502, { ok: false, error: 'The model failed — your credits were put back.', balance: back });
      }
      if (st.status !== 'COMPLETED') return json(200, { ok: true, status: st.status || 'IN_PROGRESS' });

      const out = await fal(`https://queue.fal.run/${VIDEO_MODEL()}/requests/${id}`);
      const url = (out.video && out.video.url) || (out.output && out.output.url) || null;
      if (!url) {
        const back = await C.refund(wallet.id, Number(body.charged) || 0, 'Video returned nothing');
        await C.finishRun(body.run, { status: 'failed', error_message: 'no video in the result' });
        return json(502, { ok: false, error: 'It finished but returned no video — your credits were put back.', balance: back });
      }
      await C.finishRun(body.run, { status: 'complete', output_url: url, completed_at: new Date().toISOString() });
      return json(200, { ok: true, done: true, url });
    } catch (e) {
      return json(502, { ok: false, error: String(e.message || e) });
    }
  }

  /* Checking on a queued image. The ticket is the run row, and it has to be
     this shop's. A ticket already settled — finished or refunded — answers
     from the row, so asking twice can never refund twice. */
  if (kind === 'image' && body.job) {
    let run;
    try { run = await runOwnedBy(body.run, wallet.id); }
    catch (e) { return json(502, { ok: false, error: String(e.message || e) }); }
    if (!run) return json(404, { ok: false, error: 'No such run on this shop.' });

    if (run.status === 'complete') {
      return json(200, { ok: true, done: true, images: run.output_url ? [run.output_url] : [], saved: [], savedCount: 0 });
    }
    if (run.status === 'failed') {
      return json(502, { ok: false, error: 'That run failed — its credits were already put back.' });
    }

    const statusUrl = providerStatusUrl(run);
    if (!statusUrl) return json(502, { ok: false, error: 'Lost track of that run.' });

    const prompt = (run.input_params && run.input_params.prompt) || '';
    const cost = Number(run.credits_used) || 0;

    try {
      const st = await hf(statusUrl);
      const status = String(st && st.status || '').toLowerCase();

      if (status === 'queued' || status === 'in_progress' || status === '') {
        return json(200, { ok: true, status: status || 'in_progress' });
      }
      if (status !== 'completed') {
        // failed, nsfw, canceled — none of them a picture; all of them refunded.
        const why = status === 'nsfw' ? 'The model refused the prompt as unsafe'
          : status === 'canceled' ? 'The run was canceled'
          : (st.error ? String(st.error) : 'The model failed');
        const back = await C.refund(wallet.id, cost, 'Image ' + status);
        await C.finishRun(run.id, { status: 'failed', error_message: why });
        return json(502, { ok: false, error: why + ' — your credits were put back.', balance: back });
      }

      const images = (st.images || []).map((i) => i && i.url).filter(Boolean);
      if (!images.length) {
        const back = await C.refund(wallet.id, cost, 'Image returned nothing');
        await C.finishRun(run.id, { status: 'failed', error_message: 'no image in the result' });
        return json(502, { ok: false, error: 'It finished but returned no image — your credits were put back.', balance: back });
      }

      await C.finishRun(run.id, { status: 'complete', output_url: images[0], completed_at: new Date().toISOString() });
      const kept = await keepAll(me.tenant.slug, images, prompt);
      return json(200, { ok: true, done: true, images, ...kept });
    } catch (e) {
      return json(502, { ok: false, error: String(e.message || e) });
    }
  }

  const prompt = String(body.prompt || '').trim().slice(0, 2000);
  if (!prompt) return json(400, { ok: false, error: 'Say what to make.' });

  if (kind === 'image') {
    const aspects = image.aspects;
    const aspect = aspects.includes(body.aspect) ? body.aspect : '1:1';
    const resolution = image.resolutions.includes(body.resolution) ? body.resolution : '1K';
    const batch = image.batch ? Math.min(4, Math.max(1, Number(body.batch) || 1)) : 1;

    /* Preset mode: a preset from the catalog, a product photo, and maybe a
       model reference. Without a preset the pictures are references to edit
       and the prompt does the steering. */
    const presetId = image.presets && isUuid(body.preset) ? String(body.preset) : null;
    const refs = image.references ? cleanImageUrls(body.images, presetId ? 2 : 16) : [];
    if (presetId && !refs.length) {
      return json(400, { ok: false, error: 'A preset needs a product photo — pick one from the locker.' });
    }

    const cost = C.priceOf('image', resolution, { preset: !!presetId }) * batch;
    const label = `${batch} × image ${aspect} ${resolution}${presetId ? ' preset' : ''}`;

    let left;
    try { left = await C.spend(wallet.id, cost, label); }
    catch (e) { return json(502, { ok: false, error: String(e.message || e) }); }
    if (left === null) {
      return json(402, {
        ok: false, error: 'Not enough credits — this run costs ' + cost + '.',
        need: cost, balance: wallet.credits_balance,
      });
    }

    /* ---- Higgsfield: pay, hand it to the queue, give the browser a ticket ---- */
    if (image.provider === 'higgsfield') {
      let runId;
      try {
        const params = { prompt, aspect, resolution, batch, preset: presetId, images: refs };
        runId = await C.recordRun(wallet.id, 'image', cost, params, { model_used: HF_IMAGE_MODEL(), resolution });

        const req = {
          prompt,
          quality: 'high',
          moderation: 'auto',
          resolution: resolution.toLowerCase(),        // '1k' | '2k' | '4k'
          aspect_ratio: aspect,
          enhance_prompt: !!presetId,
        };
        if (refs.length) req.image_urls = refs;
        if (presetId) req.preset_id = presetId;

        const sub = await hf(`${HF_BASE}/${HF_IMAGE_MODEL()}`, { method: 'POST', body: JSON.stringify(req) });
        if (!sub || !sub.request_id) throw new Error('The provider took the job but returned no ticket.');

        /* Where to look later, kept on the run itself; see the ticket note. */
        await C.finishRun(runId, {
          hedra_gen_id: sub.request_id,
          input_params: { ...params, _provider: { status_url: sub.status_url || null } },
        });

        return json(200, { ok: true, job: sub.request_id, run: runId, balance: left, charged: cost });
      } catch (e) {
        const back = await C.refund(wallet.id, cost, 'Image never started');
        await C.finishRun(runId, { status: 'failed', error_message: String(e.message || e) });
        return json(502, { ok: false, error: String(e.message || e) + ' — your credits were put back.', balance: back });
      }
    }

    /* ---- fal: answers straight away ---- */
    let runId;
    try {
      runId = await C.recordRun(wallet.id, 'image', cost,
        { prompt, aspect, resolution, batch }, { model_used: FAL_IMAGE_MODEL(), resolution });

      const out = await fal(`https://fal.run/${FAL_IMAGE_MODEL()}`, {
        method: 'POST',
        body: JSON.stringify({
          prompt, image_size: sizeFor(aspect, resolution),
          num_images: batch, enable_safety_checker: true,
        }),
      });
      const images = (out.images || []).map((i) => i.url).filter(Boolean);
      if (!images.length) throw new Error('The model returned no images.');

      await C.finishRun(runId, { status: 'complete', output_url: images[0], completed_at: new Date().toISOString() });

      /* Into the shop's own locker, so it can actually be used. Never allowed
         to turn a paid, successful run into a failure — see the note above. */
      const kept = await keepAll(me.tenant.slug, images, prompt);
      return json(200, { ok: true, images, balance: left, charged: cost, ...kept });
    } catch (e) {
      // Paid for nothing — give it back and say so.
      const back = await C.refund(wallet.id, cost, 'Image run failed');
      await C.finishRun(runId, { status: 'failed', error_message: String(e.message || e) });
      return json(502, { ok: false, error: String(e.message || e) + ' — your credits were put back.', balance: back });
    }
  }

  /* Video: pay, hand it to the queue, give the browser a ticket to poll. */
  const aspect = FAL_ASPECTS[body.aspect] ? body.aspect : '1:1';
  const duration = body.duration === '10' ? '10' : '5';
  const cost = C.priceOf('video', duration);

  let left;
  try { left = await C.spend(wallet.id, cost, `video ${aspect} ${duration}s`); }
  catch (e) { return json(502, { ok: false, error: String(e.message || e) }); }
  if (left === null) {
    return json(402, {
      ok: false, error: 'Not enough credits — this clip costs ' + cost + '.',
      need: cost, balance: wallet.credits_balance,
    });
  }

  let runId;
  try {
    runId = await C.recordRun(wallet.id, 'video', cost,
      { prompt, aspect, duration }, { model_used: VIDEO_MODEL(), duration_sec: Number(duration) });

    const sub = await fal(`https://queue.fal.run/${VIDEO_MODEL()}`, {
      method: 'POST',
      body: JSON.stringify({ prompt, aspect_ratio: aspect, duration }),
    });
    if (!sub.request_id) throw new Error('The provider took the job but returned no ticket.');

    await C.finishRun(runId, { hedra_gen_id: sub.request_id });
    return json(200, { ok: true, job: sub.request_id, run: runId, balance: left, charged: cost });
  } catch (e) {
    const back = await C.refund(wallet.id, cost, 'Video never started');
    await C.finishRun(runId, { status: 'failed', error_message: String(e.message || e) });
    return json(502, { ok: false, error: String(e.message || e) + ' — your credits were put back.', balance: back });
  }
};

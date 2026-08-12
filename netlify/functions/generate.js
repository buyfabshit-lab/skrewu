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
 * Provider: fal.ai — one key covers image models and video models both, which
 * is why it's the default door instead of a key per model.
 *
 * Netlify environment variables:
 *   FAL_KEY            required — from fal.ai/dashboard/keys
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GEN_IMAGE_MODEL    optional — default fal-ai/flux/schnell
 *   GEN_VIDEO_MODEL    optional — default fal-ai/kling-video/v1.6/standard/text-to-video
 *
 * GET                          → { ok, ready }   is this switched on at all
 * POST { who, k, kind:'image', prompt, aspect, resolution, batch }
 *                              → { ok, images:[url], balance }
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

const IMAGE_MODEL = () => process.env.GEN_IMAGE_MODEL || 'fal-ai/flux/schnell';
const VIDEO_MODEL = () => process.env.GEN_VIDEO_MODEL || 'fal-ai/kling-video/v1.6/standard/text-to-video';

/* The same ten shapes the settings sheet offers. Long edge comes from the
   resolution; both sides land on multiples of 8 because the models want that. */
const ASPECTS = {
  '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '21:9': [21, 9],
  '4:3': [4, 3], '3:4': [3, 4], '3:2': [3, 2], '2:3': [2, 3],
  '5:4': [5, 4], '4:5': [4, 5],
};

function sizeFor(aspect, resolution) {
  const [aw, ah] = ASPECTS[aspect] || ASPECTS['1:1'];
  const long = resolution === '2K' ? 1920 : 1024;
  const scale = long / Math.max(aw, ah);
  const r8 = (n) => Math.max(256, Math.round((n * scale) / 8) * 8);
  return { width: r8(aw), height: r8(ah) };
}

async function fal(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: 'Key ' + process.env.FAL_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const msg = (data && ((data.detail && JSON.stringify(data.detail)) || data.message)) || `provider error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

exports.handler = async (event) => {
  const ready = !!(process.env.FAL_KEY && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (event.httpMethod === 'GET') return json(200, { ok: true, ready });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!process.env.FAL_KEY) {
    return json(400, { ok: false, error: 'Not connected yet — set FAL_KEY in Netlify (fal.ai → dashboard → keys).' });
  }
  const gone = C.missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (gone.length) {
    return json(500, { ok: false, error: 'Server not configured: missing ' + gone.join(' and ') + ' in Netlify.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }

  /* Who's paying. Every run is charged, so every run needs an owner. */
  let me, wallet;
  try {
    me = await C.whoIsAsking(body.who || body.shop, body.k);
    if (me.error) return json(me.status, { ok: false, error: me.error });
    wallet = await C.walletFor(me.tenant.slug);
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }

  const kind = body.kind === 'video' ? 'video' : 'image';

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

  const prompt = String(body.prompt || '').trim().slice(0, 2000);
  if (!prompt) return json(400, { ok: false, error: 'Say what to make.' });
  const aspect = ASPECTS[body.aspect] ? body.aspect : '1:1';

  if (kind === 'image') {
    const batch = Math.min(4, Math.max(1, Number(body.batch) || 1));
    const resolution = body.resolution === '2K' ? '2K' : '1K';
    const cost = C.priceOf('image', resolution) * batch;

    let left;
    try { left = await C.spend(wallet.id, cost, `${batch} × image ${aspect} ${resolution}`); }
    catch (e) { return json(502, { ok: false, error: String(e.message || e) }); }
    if (left === null) {
      return json(402, {
        ok: false, error: 'Not enough credits — this run costs ' + cost + '.',
        need: cost, balance: wallet.credits_balance,
      });
    }

    let runId;
    try {
      runId = await C.recordRun(wallet.id, 'image', cost,
        { prompt, aspect, resolution, batch }, { model_used: IMAGE_MODEL(), resolution });

      const out = await fal(`https://fal.run/${IMAGE_MODEL()}`, {
        method: 'POST',
        body: JSON.stringify({
          prompt, image_size: sizeFor(aspect, resolution),
          num_images: batch, enable_safety_checker: true,
        }),
      });
      const images = (out.images || []).map((i) => i.url).filter(Boolean);
      if (!images.length) throw new Error('The model returned no images.');

      await C.finishRun(runId, { status: 'complete', output_url: images[0], completed_at: new Date().toISOString() });
      return json(200, { ok: true, images, balance: left, charged: cost });
    } catch (e) {
      // Paid for nothing — give it back and say so.
      const back = await C.refund(wallet.id, cost, 'Image run failed');
      await C.finishRun(runId, { status: 'failed', error_message: String(e.message || e) });
      return json(502, { ok: false, error: String(e.message || e) + ' — your credits were put back.', balance: back });
    }
  }

  /* Video: pay, hand it to the queue, give the browser a ticket to poll. */
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

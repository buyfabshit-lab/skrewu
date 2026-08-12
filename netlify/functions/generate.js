/**
 * generate — one door for making images and video from a prompt.
 *
 * The AI Image and AI Video tools both call here. The provider key stays on
 * the server; the browser sends a prompt and settings, never a key.
 *
 * Provider: fal.ai — one key covers image models and video models both, which
 * is why it's the default door instead of a key per model.
 *
 * Netlify environment variables:
 *   FAL_KEY            required — from fal.ai/dashboard/keys
 *   GEN_IMAGE_MODEL    optional — default fal-ai/flux/schnell
 *   GEN_VIDEO_MODEL    optional — default fal-ai/kling-video/v1.6/standard/text-to-video
 *                      (pick any text-to-video model in fal's catalog; this is
 *                      config, not code)
 *
 * GET                          → { ok, ready }        the store-page trick: ask, don't guess
 * POST { kind:'image', prompt, aspect, resolution, batch }
 *                              → { ok, images:[url] }  images are quick, so this waits
 * POST { kind:'video', prompt, aspect, duration }
 *                              → { ok, job }           video takes minutes, so this queues
 * POST { kind:'video', job }   → { ok, status } or { ok, done:true, url }
 *
 * Fails closed: no key means every POST refuses and says which name to set.
 */

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
    const msg = (data && (data.detail && JSON.stringify(data.detail) || data.message)) || `provider error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

exports.handler = async (event) => {
  const ready = !!process.env.FAL_KEY;

  if (event.httpMethod === 'GET') return json(200, { ok: true, ready });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!ready) {
    return json(400, { ok: false, error: 'Not connected yet — set FAL_KEY in Netlify (fal.ai → dashboard → keys).' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }

  const kind = body.kind === 'video' ? 'video' : 'image';

  /* Checking on a video that's already cooking. */
  if (kind === 'video' && body.job) {
    const id = String(body.job).replace(/[^a-zA-Z0-9-]/g, '');
    try {
      const st = await fal(`https://queue.fal.run/${VIDEO_MODEL()}/requests/${id}/status`);
      if (st.status !== 'COMPLETED') return json(200, { ok: true, status: st.status || 'IN_PROGRESS' });
      const out = await fal(`https://queue.fal.run/${VIDEO_MODEL()}/requests/${id}`);
      const url = (out.video && out.video.url) || (out.output && out.output.url) || null;
      if (!url) return json(502, { ok: false, error: 'The model finished but returned no video.' });
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
    try {
      const out = await fal(`https://fal.run/${IMAGE_MODEL()}`, {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          image_size: sizeFor(aspect, resolution),
          num_images: batch,
          enable_safety_checker: true,
        }),
      });
      const images = (out.images || []).map((i) => i.url).filter(Boolean);
      if (!images.length) return json(502, { ok: false, error: 'The model returned no images.' });
      return json(200, { ok: true, images });
    } catch (e) {
      return json(502, { ok: false, error: String(e.message || e) });
    }
  }

  /* Video: hand it to the queue and give the browser a ticket to poll with. */
  const duration = body.duration === '10' ? '10' : '5';
  try {
    const sub = await fal(`https://queue.fal.run/${VIDEO_MODEL()}`, {
      method: 'POST',
      body: JSON.stringify({ prompt, aspect_ratio: aspect, duration }),
    });
    if (!sub.request_id) return json(502, { ok: false, error: 'The provider took the job but returned no ticket.' });
    return json(200, { ok: true, job: sub.request_id });
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
};

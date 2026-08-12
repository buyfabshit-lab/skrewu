/**
 * generate-description  —  auto-write a product description in the SKREW U voice.
 *
 * Uses Anthropic if ANTHROPIC_API_KEY is set; otherwise returns a clean
 * template so the button always does *something* useful.
 *
 * Optional Netlify environment variables:
 *   ANTHROPIC_API_KEY   your Anthropic key (sk-ant-...)
 *   ANTHROPIC_MODEL     defaults to "claude-sonnet-5"
 *
 * JSON POST body: { title, keywords?, productType?, tone? }
 * Returns: { ok, description, source: "ai" | "template" }
 */

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function templateDescription({ title, keywords, productType }) {
  const kw = (keywords || '').split(',').map(s => s.trim()).filter(Boolean);
  const line = kw.length ? `Built around ${kw.slice(0, 3).join(', ')}.` : 'Made for the ones who build their own.';
  const type = productType ? productType.toLowerCase() : 'piece';
  return [
    `${title} — straight from the floor.`,
    '',
    `A ${type} with no filler and no gatekeepers. ${line}`,
    '',
    '• Underground design, limited run',
    '• Made to be worn hard',
    '• Ships from the shop',
  ].join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid JSON body' }); }

  const { title, keywords, productType, tone } = body;
  if (!title || !String(title).trim()) return json(400, { ok: false, error: 'title is required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(200, { ok: true, source: 'template', description: templateDescription({ title, keywords, productType }) });
  }

  const prompt = [
    `Write a punchy e-commerce product description for a streetwear/merch brand called SKREW U.`,
    `Brand voice: underground, gritty, direct, a little rebellious — never corporate.`,
    `Product name: ${title}`,
    productType ? `Product type: ${productType}` : '',
    keywords ? `Selling points / keywords: ${keywords}` : '',
    tone ? `Extra tone note: ${tone}` : '',
    ``,
    `Rules: 40-90 words. Open with a hook. End with 2-3 short bullet points (use "• "). No hashtags, no emojis, no markdown headers. Return ONLY the description text.`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      // Fall back to the template rather than failing the whole button.
      return json(200, {
        ok: true,
        source: 'template',
        description: templateDescription({ title, keywords, productType }),
        note: `AI unavailable (${res.status}); used template.`,
      });
    }
    const text = (data.content || []).map(b => b.text || '').join('').trim();
    return json(200, { ok: true, source: 'ai', description: text || templateDescription({ title, keywords, productType }) });
  } catch (err) {
    return json(200, {
      ok: true,
      source: 'template',
      description: templateDescription({ title, keywords, productType }),
      note: `AI error (${String(err.message || err)}); used template.`,
    });
  }
};

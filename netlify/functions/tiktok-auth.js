/**
 * tiktok-auth — where a shop lands after it authorises our app on TikTok.
 *
 * This is the redirect URL registered against the app in TikTok Shop Partner
 * Center. A seller presses "authorise", TikTok bounces them here with a
 * short-lived code, and we trade that code for the access token that lets us
 * work on their shop.
 *
 * Right now this endpoint is deliberately incomplete, and says so rather than
 * pretending. The token exchange has to be verified against a real sandbox
 * shop — TikTok signs every call and the grant is particular — and writing it
 * blind would produce something that looks finished and fails on the first
 * real seller. What it does today: exist at a stable address so the app can be
 * registered, refuse anything that isn't a genuine callback, and never write a
 * half-authorised shop into the database.
 *
 * Netlify environment variables (none of these live in the repo):
 *   TIKTOK_APP_KEY, TIKTOK_APP_SECRET   from Partner Center → your app
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

function page(statusCode, title, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<!doctype html><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
 body{background:#0a0908;color:#e8e2d4;font:15px/1.6 'Courier New',monospace;
      min-height:100dvh;display:grid;place-items:center;margin:0;padding:24px}
 .card{max-width:34rem;border:1px solid #3a3530;background:#17130e;padding:26px 28px}
 h1{font-family:'Arial Narrow',sans-serif;text-transform:uppercase;letter-spacing:.03em;
    font-size:26px;margin:0 0 12px;color:#c4f135}
 p{color:#a49c8d;margin:10px 0 0}
</style>
<div class="card"><h1>${title}</h1><p>${message}</p></div>`,
  };
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};

  // TikTok reports a refusal by sending us back an error instead of a code.
  if (q.error || q.error_description) {
    return page(400, 'Not connected',
      'TikTok refused the authorisation, so nothing was linked. You can close this and try again.');
  }

  // No code means someone opened this address directly. Say so plainly rather
  // than implying something happened.
  if (!q.code && !q.auth_code) {
    return page(400, 'Nothing to do',
      'This page is where TikTok sends a shop after it authorises the app. Opening it directly does nothing.');
  }

  if (!process.env.TIKTOK_APP_KEY || !process.env.TIKTOK_APP_SECRET) {
    return page(503, 'Not configured yet',
      'The app credentials are not set on this site, so the authorisation cannot be completed. ' +
      'Nothing was saved and the shop is unchanged.');
  }

  // Deliberately not exchanging the code yet — see the note at the top. Failing
  // closed here is the honest outcome: no token, no half-written shop record.
  return page(503, 'Almost there',
    'The shop authorised successfully and the app credentials are in place, but the token exchange ' +
    'has not been switched on yet. Nothing was saved. This is the last step to finish, and it needs ' +
    'to be tested against a sandbox shop before it can be trusted with a real one.');
};

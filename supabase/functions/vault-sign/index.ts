// vault-sign — mint short-lived signed URLs for PRIVATE originals
// (vault-originals bucket). Admin-gated: the caller must present the project
// service_role key via `x-vault-key` or `Authorization: Bearer <key>`.
// Deployed with verify_jwt = false because it implements its own auth.
//
// POST /vault-sign  { path: "ab/<hash>.png", expiresIn?: 3600 }
// POST /vault-sign  { paths: ["ab/..","cd/.."], expiresIn?: 3600 }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-vault-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isAdmin(req: Request): boolean {
  const bearer = (req.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const key = req.headers.get("x-vault-key") ?? bearer;
  return key.length > 0 && key === SERVICE_KEY;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isAdmin(req)) return json({ ok: false, error: "unauthorized" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const exp = Math.min(
      Math.max(parseInt(String(body.expiresIn ?? "3600")) || 3600, 60),
      604800, // 7 days max
    );
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    if (Array.isArray(body.paths) && body.paths.length) {
      const { data, error } = await sb.storage
        .from("vault-originals")
        .createSignedUrls(body.paths, exp);
      if (error) throw error;
      return json({ ok: true, expiresIn: exp, urls: data });
    }

    if (!body.path) return json({ ok: false, error: "path required" }, 400);
    const { data, error } = await sb.storage
      .from("vault-originals")
      .createSignedUrl(body.path, exp);
    if (error) throw error;
    return json({ ok: true, expiresIn: exp, signedUrl: data.signedUrl });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 400);
  }
});

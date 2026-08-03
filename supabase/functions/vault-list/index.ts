// vault-list — PUBLIC read API for the MCG logo/design vault.
// Browse / search assets by brand + tags + free text. Returns metadata plus
// ready-to-use public URLs for the web-sized (vault-public) derivatives.
// Deployed with verify_jwt = false: it only surfaces metadata that is already
// world-readable via the `vault_assets` RLS SELECT policy.
//
// GET  /vault-list?q=skull&brand=Death%20Corps&tags=skull,red&limit=60&offset=0
// POST /vault-list   { q, brand, tags:[], limit, offset }
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
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const publicUrl = (path: string | null) =>
  path ? `${SUPABASE_URL}/storage/v1/object/public/vault-public/${path}` : null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const u = new URL(req.url);
    const p = u.searchParams;
    let q = p.get("q");
    let brand = p.get("brand");
    let tagsRaw: string | null = p.get("tags");
    let limit = p.get("limit");
    let offset = p.get("offset");

    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      q = b.q ?? q;
      brand = b.brand ?? brand;
      tagsRaw = Array.isArray(b.tags) ? b.tags.join(",") : (b.tags ?? tagsRaw);
      limit = b.limit ?? limit;
      offset = b.offset ?? offset;
    }

    const tags = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : null;
    const lim = Math.min(parseInt(String(limit ?? "60")) || 60, 200);
    const off = Math.max(parseInt(String(offset ?? "0")) || 0, 0);

    const sb = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await sb.rpc("vault_search", {
      p_query: q && q.length ? q : null,
      p_brand: brand && brand.length ? brand : null,
      p_tags: tags && tags.length ? tags : null,
      p_limit: lim,
      p_offset: off,
    });
    if (error) throw error;

    const items = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      filename: r.filename,
      brand: r.brand,
      style_tags: r.style_tags,
      width: r.width,
      height: r.height,
      mime_type: r.mime_type,
      created_at: r.created_at,
      storage_path: r.storage_path, // pass to vault-sign for the original
      public_path: r.public_path,
      public_url: publicUrl(r.public_path as string | null),
    }));

    return json({ ok: true, count: items.length, limit: lim, offset: off, items });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 400);
  }
});

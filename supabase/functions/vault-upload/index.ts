// vault-upload — batch ingest endpoint for the vault.
// Admin-gated (service_role key via x-vault-key / Authorization: Bearer).
// Deployed with verify_jwt = false because it implements its own auth.
//
// For each file it: sha256-hashes the original bytes, skips exact-duplicate
// bytes (unique file_hash), stores the master in vault-originals, optionally
// stores a caller-supplied web-sized derivative in vault-public, and inserts a
// vault_assets row. Content-addressed paths => the same bytes always map to the
// same object, so retries are idempotent.
//
// POST /vault-upload
// {
//   "files": [{
//     "filename": "death-corps-skull.png",
//     "brand": "Death Corps",
//     "style_tags": ["skull","red","crest"],
//     "mime_type": "image/png",
//     "width": 3000, "height": 3000,
//     "source_path": "/archive/DeathCorps/skull.png",
//     "original_base64": "<base64 of master bytes>",
//     "public_base64": "<base64 of web-sized webp>",   // optional
//     "public_mime": "image/webp"                        // optional
//   }]
// }
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

const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/tiff": ".tiff",
  "application/pdf": ".pdf",
  "application/postscript": ".ai",
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extFor(filename: string, mime?: string): string {
  const m = mime && EXT[mime];
  if (m) return m;
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!isAdmin(req)) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    const body = await req.json();
    const files = Array.isArray(body?.files) ? body.files : [];
    if (!files.length) return json({ ok: false, error: "no files" }, 400);
    if (files.length > 200) {
      return json({ ok: false, error: "max 200 files per batch" }, 400);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const results: unknown[] = [];
    let inserted = 0, duplicate = 0, errored = 0;

    for (const f of files) {
      try {
        if (!f?.original_base64 || !f?.filename) {
          throw new Error("filename and original_base64 required");
        }
        const bytes = b64ToBytes(f.original_base64);
        const hash = await sha256Hex(bytes);

        // dedupe on exact bytes
        const { data: existing } = await sb
          .from("vault_assets")
          .select("id")
          .eq("file_hash", hash)
          .maybeSingle();
        if (existing) {
          duplicate++;
          results.push({ filename: f.filename, status: "duplicate", id: existing.id });
          continue;
        }

        const ext = extFor(f.filename, f.mime_type);
        const storagePath = `${hash.slice(0, 2)}/${hash}${ext}`;

        const up = await sb.storage
          .from("vault-originals")
          .upload(storagePath, bytes, {
            contentType: f.mime_type ?? "application/octet-stream",
            upsert: true,
          });
        if (up.error) throw up.error;

        // optional web-sized derivative
        let publicPath: string | null = null;
        if (f.public_base64) {
          const pMime = f.public_mime ?? "image/webp";
          const pExt = extFor(f.filename, pMime) || ".webp";
          publicPath = `${hash.slice(0, 2)}/${hash}${pExt}`;
          const pub = await sb.storage
            .from("vault-public")
            .upload(publicPath, b64ToBytes(f.public_base64), {
              contentType: pMime,
              upsert: true,
            });
          if (pub.error) throw pub.error;
        }

        const { data: row, error: insErr } = await sb
          .from("vault_assets")
          .insert({
            filename: f.filename,
            storage_path: storagePath,
            public_path: publicPath,
            brand: f.brand ?? null,
            style_tags: Array.isArray(f.style_tags) ? f.style_tags : [],
            width: f.width ?? null,
            height: f.height ?? null,
            file_hash: hash,
            file_size: bytes.byteLength,
            mime_type: f.mime_type ?? null,
            source_path: f.source_path ?? null,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;

        inserted++;
        results.push({ filename: f.filename, status: "inserted", id: row.id, storage_path: storagePath });
      } catch (e) {
        errored++;
        results.push({
          filename: f?.filename ?? "?",
          status: "error",
          error: String((e as Error)?.message ?? e),
        });
      }
    }

    return json({ ok: true, inserted, duplicate, errored, results });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 400);
  }
});

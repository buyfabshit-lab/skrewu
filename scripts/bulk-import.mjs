#!/usr/bin/env node
// ============================================================================
// SKREWU VAULT — bulk importer
// ----------------------------------------------------------------------------
// Walks a folder tree and ingests every asset into the Supabase vault:
//   • sha256-hashes each file (content-addressed, exact-byte dedupe)
//   • uploads the master to the private `vault-originals` bucket
//   • (optional --public) renders a web-sized webp into `vault-public`
//   • inserts a `vault_assets` row (brand + tags + dims + hash + provenance)
//
// Designed for 75k+ files: preloads existing hashes, streams the tree with a
// bounded worker pool, and is fully resumable — rerun any time; already-ingested
// bytes are skipped in-memory and the DB unique(file_hash) is the backstop.
//
// Talks to Supabase directly with the SERVICE ROLE key (bypasses RLS) rather
// than through the vault-upload edge function, so a huge archive ingests fast
// without per-request base64/HTTP overhead. Use the edge function for app-driven
// or remote uploads; use this for the big local archive walk.
//
// USAGE
//   export SUPABASE_URL="https://qmztuagvxopahowexrum.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="<service_role key — never commit>"
//   node scripts/bulk-import.mjs --dir /path/to/MCG-archive --public
//
// COMMON FLAGS
//   --dir <path>          root folder to walk            (required)
//   --public             also render + upload web-sized webp derivatives
//   --brand <name>       force one brand for everything  (default: infer from
//                        the first folder under --dir, e.g. .../Death Corps/…)
//   --tags a,b,c         extra style tags applied to every asset
//   --concurrency <n>    parallel workers                (default 6)
//   --max-dim <px>       longest edge of web derivative  (default 1600)
//   --quality <1-100>    webp quality                    (default 82)
//   --limit <n>          stop after N new ingests (smoke test)
//   --dry-run            hash + plan only; no uploads, no inserts
//
// DEPS (install once on the import machine):
//   npm i @supabase/supabase-js sharp     # sharp only needed for --public
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

// ---- args ------------------------------------------------------------------
function parseArgs(argv) {
  const a = { concurrency: 6, maxDim: 1600, quality: 82 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--dir") a.dir = next();
    else if (k === "--public") a.public = true;
    else if (k === "--brand") a.brand = next();
    else if (k === "--tags") a.tags = next().split(",").map((t) => t.trim()).filter(Boolean);
    else if (k === "--concurrency") a.concurrency = parseInt(next()) || 6;
    else if (k === "--max-dim") a.maxDim = parseInt(next()) || 1600;
    else if (k === "--quality") a.quality = parseInt(next()) || 82;
    else if (k === "--limit") a.limit = parseInt(next());
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--help" || k === "-h") a.help = true;
  }
  return a;
}

const args = parseArgs(process.argv);
if (args.help || !args.dir) {
  console.log("Usage: node scripts/bulk-import.mjs --dir <folder> [--public] [--brand NAME] [--tags a,b] [--concurrency N] [--dry-run]");
  process.exit(args.help ? 0 : 1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.");
  process.exit(1);
}

const ORIGINALS = "vault-originals";
const PUBLIC = "vault-public";

// extensions we ingest as masters
const MASTER_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".tif", ".tiff",
  ".bmp", ".pdf", ".ai", ".eps", ".psd",
]);
// extensions sharp can rasterize into a web derivative
const RASTER_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp"]);

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".tif": "image/tiff", ".tiff": "image/tiff", ".bmp": "image/bmp",
  ".pdf": "application/pdf", ".ai": "application/postscript",
  ".eps": "application/postscript", ".psd": "image/vnd.adobe.photoshop",
};

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---- helpers ---------------------------------------------------------------
function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function titleCase(s) {
  return s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// brand = first path segment under --dir; tags = the segments in between
function classify(fullPath) {
  const rel = path.relative(args.dir, fullPath);
  const parts = rel.split(path.sep);
  const folders = parts.slice(0, -1); // drop filename
  const brand = args.brand ?? (folders.length ? titleCase(folders[0]) : null);
  const folderTags = folders.slice(1).map((f) => f.toLowerCase());
  const tags = [...new Set([...(args.tags ?? []), ...folderTags])];
  return { brand, tags };
}

async function* walk(dir) {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue; // skip dotfiles/.DS_Store
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && MASTER_EXT.has(path.extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

// lazy sharp loader (only when --public)
let sharpMod = null;
async function getSharp() {
  if (sharpMod) return sharpMod;
  try {
    sharpMod = (await import("sharp")).default;
  } catch {
    console.error("--public needs sharp:  npm i sharp   (continuing without derivatives)");
    args.public = false;
  }
  return sharpMod;
}

// ---- main ------------------------------------------------------------------
const stats = { scanned: 0, uploaded: 0, duplicate: 0, errored: 0, skipped: 0 };

async function preloadHashes() {
  process.stdout.write("Preloading existing hashes… ");
  const seen = new Set();
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from("vault_assets")
      .select("file_hash")
      .range(from, from + page - 1);
    if (error) throw error;
    if (!data.length) break;
    for (const r of data) seen.add(r.file_hash);
    if (data.length < page) break;
  }
  console.log(`${seen.size} already in vault.`);
  return seen;
}

async function ingest(file, seen) {
  stats.scanned++;
  try {
    const buf = await readFile(file);
    const hash = sha256Hex(buf);
    if (seen.has(hash)) { stats.duplicate++; return; }
    seen.add(hash); // reserve so concurrent workers don't double-upload

    const ext = path.extname(file).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const storagePath = `${hash.slice(0, 2)}/${hash}${ext}`;
    const { brand, tags } = classify(file);

    let publicPath = null, width = null, height = null;

    if (args.dryRun) {
      stats.skipped++;
      console.log(`[dry] ${brand ?? "—"} :: ${path.basename(file)} (${hash.slice(0, 8)})`);
      return;
    }

    // web-sized derivative
    if (args.public && RASTER_EXT.has(ext)) {
      const sharp = await getSharp();
      if (sharp) {
        const img = sharp(buf, { failOn: "none" });
        const meta = await img.metadata();
        const out = await img
          .rotate()
          .resize({ width: args.maxDim, height: args.maxDim, fit: "inside", withoutEnlargement: true })
          .webp({ quality: args.quality })
          .toBuffer();
        publicPath = `${hash.slice(0, 2)}/${hash}.webp`;
        const pub = await sb.storage.from(PUBLIC).upload(publicPath, out, { contentType: "image/webp", upsert: true });
        if (pub.error) throw pub.error;
        width = meta.width ?? null;
        height = meta.height ?? null;
      }
    } else if (args.public && ext === ".svg") {
      publicPath = `${hash.slice(0, 2)}/${hash}.svg`;
      const pub = await sb.storage.from(PUBLIC).upload(publicPath, buf, { contentType: "image/svg+xml", upsert: true });
      if (pub.error) throw pub.error;
    }

    // master
    const up = await sb.storage.from(ORIGINALS).upload(storagePath, buf, { contentType: mime, upsert: true });
    if (up.error) throw up.error;

    // metadata row
    const { error: insErr } = await sb.from("vault_assets").insert({
      filename: path.basename(file),
      storage_path: storagePath,
      public_path: publicPath,
      brand,
      style_tags: tags,
      width,
      height,
      file_hash: hash,
      file_size: buf.byteLength,
      mime_type: mime,
      source_path: file,
    });
    // 23505 = unique_violation → another run/worker won the race; treat as dupe
    if (insErr && insErr.code !== "23505") throw insErr;
    if (insErr) { stats.duplicate++; return; }

    stats.uploaded++;
    if (stats.uploaded % 100 === 0) {
      console.log(`  +${stats.uploaded} ingested (${stats.duplicate} dupes, ${stats.errored} err)…`);
    }
  } catch (e) {
    stats.errored++;
    console.error(`  ! ${path.basename(file)}: ${e?.message ?? e}`);
  }
}

// bounded worker pool over the async file iterator
async function run() {
  const seen = await preloadHashes();
  const iter = walk(args.dir);
  let done = false;

  async function worker() {
    for (;;) {
      if (args.limit && stats.uploaded >= args.limit) return;
      const { value: file, done: d } = await iter.next();
      if (d) { done = true; return; }
      await ingest(file, seen);
    }
  }

  const workers = Array.from({ length: Math.max(1, args.concurrency) }, worker);
  await Promise.all(workers);
  void done;

  console.log("\n──────── VAULT IMPORT COMPLETE ────────");
  console.log(`  scanned:    ${stats.scanned}`);
  console.log(`  ingested:   ${stats.uploaded}`);
  console.log(`  duplicates: ${stats.duplicate}`);
  console.log(`  errored:    ${stats.errored}`);
  if (args.dryRun) console.log(`  (dry run — nothing written)`);
}

run().catch((e) => { console.error("FATAL:", e); process.exit(1); });

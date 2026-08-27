// One-off: upload everything under storage-files/ into the Supabase bucket,
// preserving folder paths (storage-files/blanks/x.png -> key "blanks/x.png",
// served at /manus-storage/blanks/x.png).
//
// Usage (from repo root, with SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
// SUPABASE_BUCKET set in the environment or a local .env):
//   npm run seed:storage
import "dotenv/config";
import fs from "fs";
import path from "path";
import { storagePut, objectExists } from "../server/storage";

const ROOT = path.resolve(process.cwd(), "storage-files");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`No storage-files/ directory found at ${ROOT}`);
    process.exit(1);
  }

  const files = walk(ROOT);
  if (files.length === 0) {
    console.log("storage-files/ is empty — nothing to upload.");
    return;
  }

  console.log(`Uploading ${files.length} file(s) from ${ROOT} ...`);
  let ok = 0;
  let skipped = 0;
  const failures: Array<{ key: string; error: string }> = [];

  for (const file of files) {
    // Key = path relative to storage-files/, with forward slashes.
    const key = path.relative(ROOT, file).split(path.sep).join("/");
    try {
      // Idempotent: skip keys that already exist in the bucket.
      if (await objectExists(key)) {
        console.log(`  = ${key} (already present, skipped)`);
        skipped++;
        continue;
      }
      const buffer = fs.readFileSync(file);
      const { url } = await storagePut(key, buffer);
      console.log(`  ✓ ${key} -> ${url}`);
      ok++;
    } catch (err: any) {
      const message = err?.message ?? String(err);
      console.error(`  ✗ ${key}: ${message}`);
      failures.push({ key, error: message });
    }
  }

  console.log(
    `\nDone: ${ok} uploaded, ${skipped} skipped (already present), ${failures.length} failed (of ${files.length} total).`,
  );
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Minimal server entry: serves the existing static site (index.html, app.js and
// sibling assets from the repo root) and mounts the Supabase-backed storage
// proxy at /manus-storage/*. Everything is driven from env vars via ./_core/env.
import path from "path";
import express from "express";
import { ENV } from "./_core/env";
import { registerStorageProxy } from "./_core/storageProxy";

const app = express();

// Storage proxy first so /manus-storage/* is never shadowed by static files.
registerStorageProxy(app);

// Serve the static front-end from the repo root.
const ROOT = path.resolve(process.cwd());
app.use(express.static(ROOT));

app.listen(ENV.port, () => {
  console.log(`[skrewu] listening on http://0.0.0.0:${ENV.port}`);
  console.log(`[skrewu] storage proxy at /manus-storage/* (bucket: ${ENV.supabaseBucket || "unset"})`);
});

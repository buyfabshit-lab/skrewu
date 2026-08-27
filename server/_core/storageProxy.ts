import type { Express } from "express";
import { getPublicUrl, objectExists, normalizeKey } from "../storage";

// Serve /manus-storage/<key> by 307-redirecting to the object's Supabase
// Storage public URL. Returns 404 when the object does not exist.
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = normalizeKey(req.path.replace("/manus-storage/", ""));
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    try {
      const exists = await objectExists(key);
      if (!exists) {
        res.status(404).send("Not found");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, getPublicUrl(key));
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

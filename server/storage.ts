// Supabase Storage — uploads persist across server restarts and redeploys.
// Configured entirely from env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_BUCKET); nothing is hardcoded.
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ENV } from './_core/env';

let _client: SupabaseClient | null = null;

/** Lazily create (and cache) the Supabase client from env vars. */
export function getSupabase(): SupabaseClient {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error(
      'Supabase storage not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  if (!_client) {
    _client = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

export function getBucket(): string {
  if (!ENV.supabaseBucket) {
    throw new Error('Supabase storage not configured: set SUPABASE_BUCKET');
  }
  return ENV.supabaseBucket;
}

/** Normalize a storage key: forward slashes, no leading slash. Preserves folders. */
export function normalizeKey(relKey: string): string {
  return relKey.replace(/\\/g, '/').replace(/^\/+/, '');
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.zip': 'application/zip',
};

/** Best-effort content type derived from a key's file extension. */
export function contentTypeFromKey(relKey: string): string {
  const ext = path.extname(normalizeKey(relKey)).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** Public URL for a key in the configured bucket. */
export function getPublicUrl(relKey: string): string {
  const key = normalizeKey(relKey);
  return getSupabase().storage.from(getBucket()).getPublicUrl(key).data.publicUrl;
}

/** Whether an object exists at the given key in the bucket. */
export async function objectExists(relKey: string): Promise<boolean> {
  const key = normalizeKey(relKey);
  const dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
  const name = key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key;
  const { data, error } = await getSupabase()
    .storage
    .from(getBucket())
    .list(dir, { limit: 100, search: name });
  if (error) return false;
  return Boolean(data?.some((entry) => entry.name === name));
}

/**
 * Upload a file to Supabase Storage at the given key (folders preserved) and
 * return its key and public URL. Upserts, so re-uploads overwrite in place.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType?: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  const type = contentType ?? contentTypeFromKey(key);

  const { error } = await getSupabase()
    .storage
    .from(getBucket())
    .upload(key, buffer, { upsert: true, contentType: type });

  if (error) {
    throw new Error(`[Storage] Supabase upload failed for ${key}: ${error.message}`);
  }

  const url = getPublicUrl(key);
  console.log(`[Storage] Uploaded: ${key} (${buffer.length} bytes) → ${url}`);
  return { key, url };
}

/**
 * Get the public URL for a previously stored file.
 */
export async function storageGet(
  relKey: string,
  _expiresIn?: number,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: getPublicUrl(key) };
}

import 'server-only';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

/**
 * File storage abstraction.
 *
 * Uploads go to Supabase Storage when the project is configured
 * (`SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, plus
 * `SUPABASE_SERVICE_ROLE_KEY`), which is required for serverless / read-only
 * hosts. When those env vars are absent (e.g. local development) it
 * transparently falls back to writing under `public/uploads/`.
 *
 * ── Supabase Storage setup (one-time) ────────────────────────────────────────
 *  1. Create a PUBLIC bucket (default: `media`) in the Supabase dashboard,
 *     or override the name via `SUPABASE_STORAGE_BUCKET`.
 *  2. Set the env vars:
 *       SUPABASE_URL=https://<project-ref>.supabase.co
 *       SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   (server-only secret)
 *       SUPABASE_STORAGE_BUCKET=media                  (optional)
 *  3. Public read is enough for coach videos; the service-role key is only used
 *     server-side for uploads, so no client RLS policy is required.
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'media';

function getSupabaseUrl(): string | undefined {
  // The project URL is public by design, so deployments that already expose it
  // to the browser do not need to duplicate it under a server-only variable.
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(getSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Stores a file and returns its publicly reachable URL. `key` is a relative
 * path such as `videos/intro-12-1699999999.mp4`.
 */
export async function storeFile(
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<string> {
  if (isSupabaseStorageConfigured()) {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      getSupabaseUrl()!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, bytes, { contentType, upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
    return data.publicUrl;
  }

  // Local fallback: write under public/uploads/<key>.
  const dir = path.join(process.cwd(), 'public', 'uploads', path.dirname(key));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(process.cwd(), 'public', 'uploads', key), bytes);
  return `/uploads/${key.split(path.sep).join('/')}`;
}

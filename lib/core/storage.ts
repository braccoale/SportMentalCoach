import 'server-only';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

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
const PRIVATE_BUCKET =
  process.env.SUPABASE_CHAT_STORAGE_BUCKET || 'chat-attachments';
const PRIVATE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];
const PRIVATE_MAX_BYTES = 4 * 1024 * 1024;
let privateBucketReady: Promise<void> | null = null;

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

function assertSafePrivateKey(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('..') ||
    !/^[a-zA-Z0-9/_\-.]+$/.test(key)
  ) {
    throw new Error('Chiave allegato non valida.');
  }
}

function localPrivatePath(key: string): string {
  assertSafePrivateKey(key);
  return path.join(
    process.cwd(),
    '.local-storage',
    ...key.split('/').filter(Boolean)
  );
}

async function ensurePrivateBucket(client: SupabaseClient): Promise<void> {
  if (!privateBucketReady) {
    privateBucketReady = (async () => {
      const { data: buckets, error: listError } =
        await client.storage.listBuckets();
      if (listError) throw new Error(listError.message);

      const existing = buckets.find((bucket) => bucket.name === PRIVATE_BUCKET);
      if (!existing) {
        const { error } = await client.storage.createBucket(PRIVATE_BUCKET, {
          public: false,
          fileSizeLimit: PRIVATE_MAX_BYTES,
          allowedMimeTypes: PRIVATE_ALLOWED_MIME_TYPES,
        });
        if (error) throw new Error(error.message);
      } else if (existing.public) {
        const { error } = await client.storage.updateBucket(PRIVATE_BUCKET, {
          public: false,
          fileSizeLimit: PRIVATE_MAX_BYTES,
          allowedMimeTypes: PRIVATE_ALLOWED_MIME_TYPES,
        });
        if (error) throw new Error(error.message);
      }
    })().catch((error) => {
      privateBucketReady = null;
      throw error;
    });
  }
  await privateBucketReady;
}

async function getPrivateStorageClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(
    getSupabaseUrl()!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  await ensurePrivateBucket(client);
  return client.storage.from(PRIVATE_BUCKET);
}

/**
 * Stores a private chat attachment. Only the opaque object key is persisted;
 * files are read back through a participant-authorized API route.
 */
export async function storePrivateFile(
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<void> {
  assertSafePrivateKey(key);
  if (isSupabaseStorageConfigured()) {
    const bucket = await getPrivateStorageClient();
    const { error } = await bucket.upload(key, bytes, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const filePath = localPrivatePath(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

/** Reads a private object for an already-authorized caller. */
export async function readPrivateFile(key: string): Promise<Buffer> {
  assertSafePrivateKey(key);
  if (isSupabaseStorageConfigured()) {
    const bucket = await getPrivateStorageClient();
    const { data, error } = await bucket.download(key);
    if (error) throw new Error(error.message);
    return Buffer.from(await data.arrayBuffer());
  }

  return readFile(localPrivatePath(key));
}

/** Best-effort cleanup when a message insert fails after an upload. */
export async function deletePrivateFile(key: string): Promise<void> {
  assertSafePrivateKey(key);
  if (isSupabaseStorageConfigured()) {
    const bucket = await getPrivateStorageClient();
    const { error } = await bucket.remove([key]);
    if (error) throw new Error(error.message);
    return;
  }

  try {
    await unlink(localPrivatePath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

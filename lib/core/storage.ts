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

type PrivateBucketConfig = {
  bucketName: string;
  allowedMimeTypes: string[];
  maxBytes: number;
  /** Sottocartella locale di fallback, separata per bucket per non mischiare i file. */
  localDir: string;
};

/**
 * Un archivio privato parametrizzato per bucket: stesso comportamento di
 * prima (Supabase Storage se configurato, altrimenti una cartella locale di
 * fallback), ma riusabile per più bucket con MIME e limiti diversi — la
 * chat accetta solo immagini fino a 4 MB, l'Academy accetta anche PDF e
 * video con un tetto più alto (vedi `academyMaterialsStore` sotto).
 */
function createPrivateBucketStore(config: PrivateBucketConfig) {
  let bucketReady: Promise<void> | null = null;

  function localPath(key: string): string {
    assertSafePrivateKey(key);
    return path.join(process.cwd(), config.localDir, ...key.split('/').filter(Boolean));
  }

  async function ensureBucket(client: SupabaseClient): Promise<void> {
    if (!bucketReady) {
      bucketReady = (async () => {
        const { data: buckets, error: listError } = await client.storage.listBuckets();
        if (listError) throw new Error(listError.message);

        const existing = buckets.find((bucket) => bucket.name === config.bucketName);
        if (!existing) {
          const { error } = await client.storage.createBucket(config.bucketName, {
            public: false,
            fileSizeLimit: config.maxBytes,
            allowedMimeTypes: config.allowedMimeTypes,
          });
          if (error) throw new Error(error.message);
        } else if (existing.public) {
          const { error } = await client.storage.updateBucket(config.bucketName, {
            public: false,
            fileSizeLimit: config.maxBytes,
            allowedMimeTypes: config.allowedMimeTypes,
          });
          if (error) throw new Error(error.message);
        }
      })().catch((error) => {
        bucketReady = null;
        throw error;
      });
    }
    await bucketReady;
  }

  async function getClient() {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(getSupabaseUrl()!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await ensureBucket(client);
    return client.storage.from(config.bucketName);
  }

  return {
    maxBytes: config.maxBytes,
    allowedMimeTypes: config.allowedMimeTypes,

    async storeFile(key: string, bytes: Buffer, contentType: string): Promise<void> {
      assertSafePrivateKey(key);
      if (isSupabaseStorageConfigured()) {
        const bucket = await getClient();
        const { error } = await bucket.upload(key, bytes, { contentType, upsert: false });
        if (error) throw new Error(error.message);
        return;
      }

      const filePath = localPath(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, bytes);
    },

    async readFile(key: string): Promise<Buffer> {
      assertSafePrivateKey(key);
      if (isSupabaseStorageConfigured()) {
        const bucket = await getClient();
        const { data, error } = await bucket.download(key);
        if (error) throw new Error(error.message);
        return Buffer.from(await data.arrayBuffer());
      }

      return readFile(localPath(key));
    },

    async deleteFile(key: string): Promise<void> {
      assertSafePrivateKey(key);
      if (isSupabaseStorageConfigured()) {
        const bucket = await getClient();
        const { error } = await bucket.remove([key]);
        if (error) throw new Error(error.message);
        return;
      }

      try {
        await unlink(localPath(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },
  };
}

const chatAttachmentsStore = createPrivateBucketStore({
  bucketName: process.env.SUPABASE_CHAT_STORAGE_BUCKET || 'chat-attachments',
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 4 * 1024 * 1024,
  localDir: '.local-storage',
});

/**
 * Stores a private chat attachment. Only the opaque object key is persisted;
 * files are read back through a participant-authorized API route.
 */
export const storePrivateFile = chatAttachmentsStore.storeFile;
/** Reads a private object for an already-authorized caller. */
export const readPrivateFile = chatAttachmentsStore.readFile;
/** Best-effort cleanup when a message insert fails after an upload. */
export const deletePrivateFile = chatAttachmentsStore.deleteFile;

// Il progetto Supabase ha oggi un tetto di upload globale a 50 MB finché non
// viene alzato (la stessa ragione per cui le registrazioni audio lunghe si
// perdono, vedi memoria "limite-upload-supabase-audio"): 45 MB lascia un
// margine sotto quel tetto senza promettere un limite che il progetto non
// può ancora rispettare. Un video più lungo del margine va alzato insieme al
// tetto globale, non da qui.
const academyMaterialsStore = createPrivateBucketStore({
  bucketName: process.env.SUPABASE_ACADEMY_STORAGE_BUCKET || 'academy-materials',
  allowedMimeTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'video/mp4',
    'video/quicktime',
  ],
  maxBytes: 45 * 1024 * 1024,
  localDir: '.local-storage-academy',
});

/** Stores an Academy module material (document, slide deck or video). */
export const storeAcademyMaterial = academyMaterialsStore.storeFile;
/** Reads an Academy material for an already-authorized caller. */
export const readAcademyMaterial = academyMaterialsStore.readFile;
/** Removes an Academy material's stored bytes when its row is deleted. */
export const deleteAcademyMaterial = academyMaterialsStore.deleteFile;
export const ACADEMY_MATERIAL_MAX_BYTES = academyMaterialsStore.maxBytes;
export const ACADEMY_MATERIAL_ALLOWED_MIME_TYPES = academyMaterialsStore.allowedMimeTypes;

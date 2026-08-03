import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AudioRecordingConfig } from './recording-config';

export type StoredAudioObject = {
  exists: boolean;
  sizeBytes: number | null;
  mimeType: string | null;
  checksum: string | null;
};

export interface AudioStorage {
  inspect(key: string): Promise<StoredAudioObject>;
  download(key: string): Promise<Buffer>;
  deleteAndVerify(key: string): Promise<void>;
}

export class InMemoryAudioStorage implements AudioStorage {
  private readonly objects = new Map<string, { bytes: Buffer; mimeType: string; checksum: string | null }>();
  put(key: string, bytes: Buffer, mimeType = 'audio/ogg', checksum: string | null = null) { this.objects.set(key, { bytes, mimeType, checksum }); }
  async inspect(key: string): Promise<StoredAudioObject> { const value = this.objects.get(key); return value ? { exists: true, sizeBytes: value.bytes.length, mimeType: value.mimeType, checksum: value.checksum } : { exists: false, sizeBytes: null, mimeType: null, checksum: null }; }
  async download(key: string): Promise<Buffer> { const value = this.objects.get(key); if (!value) throw new Error('AUDIO_OBJECT_NOT_FOUND'); return Buffer.from(value.bytes); }
  async deleteAndVerify(key: string): Promise<void> { this.objects.delete(key); if ((await this.inspect(key)).exists) throw new Error('AUDIO_OBJECT_DELETE_NOT_VERIFIED'); }
}

let readyBucket: Promise<void> | null = null;

function storageClient(config: AudioRecordingConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Creates/repairs only the dedicated configured bucket. A public bucket causes
 * start to fail if it cannot be made private before Egress is requested.
 */
export async function ensureAudioBucketPrivate(
  config: AudioRecordingConfig
): Promise<void> {
  if (!readyBucket) {
    readyBucket = (async () => {
      const client = storageClient(config);
      const { data: buckets, error: listError } =
        await client.storage.listBuckets();
      if (listError) throw new Error('AUDIO_BUCKET_LIST_FAILED');

      const existing = buckets.find((entry) => entry.name === config.bucket);
      if (!existing) {
        const { error } = await client.storage.createBucket(config.bucket, {
          public: false,
          allowedMimeTypes: ['audio/ogg'],
          fileSizeLimit: config.maxBytes,
        });
        if (error) throw new Error('AUDIO_BUCKET_CREATE_FAILED');
      } else {
        const { error } = await client.storage.updateBucket(config.bucket, {
          public: false,
          allowedMimeTypes: ['audio/ogg'],
          fileSizeLimit: config.maxBytes,
        });
        if (error) throw new Error('AUDIO_BUCKET_PRIVACY_FAILED');
      }

      const { data: verified, error: verifyError } =
        await client.storage.getBucket(config.bucket);
      if (verifyError || !verified || verified.public) {
        throw new Error('AUDIO_BUCKET_NOT_PRIVATE');
      }
    })().catch((error) => {
      readyBucket = null;
      throw error;
    });
  }
  await readyBucket;
}

function splitObjectKey(key: string): { folder: string; name: string } {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('..') ||
    !/^[a-zA-Z0-9/_\-.]+$/.test(key)
  ) {
    throw new Error('INVALID_AUDIO_OBJECT_KEY');
  }
  const parts = key.split('/');
  const name = parts.pop()!;
  return { folder: parts.join('/'), name };
}

export async function inspectAudioObject(
  config: AudioRecordingConfig,
  key: string
): Promise<StoredAudioObject> {
  const { folder, name } = splitObjectKey(key);
  const client = storageClient(config);
  const { data, error } = await client.storage
    .from(config.bucket)
    .list(folder, { limit: 2, search: name });
  if (error) throw new Error('AUDIO_OBJECT_VERIFY_FAILED');
  const object = data.find((entry) => entry.name === name);
  if (!object) {
    return {
      exists: false,
      sizeBytes: null,
      mimeType: null,
      checksum: null,
    };
  }
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const size = Number(metadata.size);
  const mimeType =
    typeof metadata.mimetype === 'string' ? metadata.mimetype : null;
  const checksum =
    typeof metadata.eTag === 'string'
      ? metadata.eTag
      : typeof metadata.etag === 'string'
        ? metadata.etag
        : null;
  return {
    exists: true,
    sizeBytes: Number.isFinite(size) ? size : null,
    mimeType,
    checksum,
  };
}

export async function deleteAudioObjectAndVerify(
  config: AudioRecordingConfig,
  key: string
): Promise<void> {
  splitObjectKey(key);
  const client = storageClient(config);
  const { error } = await client.storage.from(config.bucket).remove([key]);
  if (error) throw new Error('AUDIO_OBJECT_DELETE_FAILED');
  if ((await inspectAudioObject(config, key)).exists) {
    throw new Error('AUDIO_OBJECT_DELETE_NOT_VERIFIED');
  }
}

/** Server-only private object download; this never creates a browser URL. */
export async function downloadAudioObject(
  config: AudioRecordingConfig,
  key: string
): Promise<Buffer> {
  splitObjectKey(key);
  const { data, error } = await storageClient(config).storage
    .from(config.bucket)
    .download(key);
  if (error || !data) throw new Error('AUDIO_OBJECT_NOT_FOUND');
  return Buffer.from(await data.arrayBuffer());
}

export function createProductionAudioStorage(config: AudioRecordingConfig): AudioStorage {
  return { inspect: (key) => inspectAudioObject(config, key), download: (key) => downloadAudioObject(config, key), deleteAndVerify: (key) => deleteAudioObjectAndVerify(config, key) };
}

export async function listAudioObjectKeys(
  config: AudioRecordingConfig,
  prefix = 'audio-recordings',
  maxObjects = 2_000
): Promise<{ keys: string[]; truncated: boolean }> {
  const client = storageClient(config);
  const keys: string[] = [];
  const queue = [prefix];
  while (queue.length > 0 && keys.length < maxObjects) {
    const folder = queue.shift()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await client.storage
        .from(config.bucket)
        .list(folder, { limit: 100, offset, sortBy: { column: 'name' } });
      if (error) throw new Error('AUDIO_BUCKET_SCAN_FAILED');
      for (const entry of data) {
        const key = `${folder}/${entry.name}`;
        if (entry.id) keys.push(key);
        else queue.push(key);
        if (keys.length >= maxObjects) break;
      }
      if (data.length < 100 || keys.length >= maxObjects) break;
      offset += data.length;
    }
  }
  return { keys, truncated: queue.length > 0 || keys.length >= maxObjects };
}

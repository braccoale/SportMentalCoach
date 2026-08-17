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
  /**
   * URL temporanea verso un oggetto privato, per un consumatore esterno
   * fidato.
   *
   * Serve a far scaricare l'audio al provider Speech-to-Text senza che il
   * nostro processo tenga il file in memoria: era il caricamento dei byte
   * dentro una function con un tetto di sessanta secondi a rendere
   * impossibili le sessioni lunghe. La scadenza è breve e l'URL viene
   * rigenerata a ogni tentativo, così una reimmissione a distanza di ore non
   * dipende mai da un collegamento vecchio.
   */
  createSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** Carica un oggetto nel bucket privato. Serve alle note vocali del coach. */
  upload(key: string, bytes: Buffer, mimeType: string): Promise<void>;
}

export class InMemoryAudioStorage implements AudioStorage {
  private readonly objects = new Map<string, { bytes: Buffer; mimeType: string; checksum: string | null }>();
  put(key: string, bytes: Buffer, mimeType = 'audio/ogg', checksum: string | null = null) { this.objects.set(key, { bytes, mimeType, checksum }); }
  async inspect(key: string): Promise<StoredAudioObject> { const value = this.objects.get(key); return value ? { exists: true, sizeBytes: value.bytes.length, mimeType: value.mimeType, checksum: value.checksum } : { exists: false, sizeBytes: null, mimeType: null, checksum: null }; }
  async download(key: string): Promise<Buffer> { const value = this.objects.get(key); if (!value) throw new Error('AUDIO_OBJECT_NOT_FOUND'); return Buffer.from(value.bytes); }
  async deleteAndVerify(key: string): Promise<void> { this.objects.delete(key); if ((await this.inspect(key)).exists) throw new Error('AUDIO_OBJECT_DELETE_NOT_VERIFIED'); }
  async createSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!this.objects.has(key)) throw new Error('AUDIO_OBJECT_NOT_FOUND');
    return `https://storage.invalid/${key}?expires=${expiresInSeconds}`;
  }
  async upload(key: string, bytes: Buffer, mimeType: string): Promise<void> {
    this.put(key, bytes, mimeType);
  }
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
/**
 * Tipi ammessi nel bucket privato.
 *
 * `audio/ogg` e' quello che produce Track Egress. Gli altri servono alle note
 * vocali del coach: MediaRecorder produce webm su Chrome e Firefox, mp4 su
 * Safari, e non c'e' un formato che vada bene ovunque.
 */
const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
];

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
          allowedMimeTypes: ALLOWED_AUDIO_MIME_TYPES,
          fileSizeLimit: config.maxBytes,
        });
        if (error) throw new Error('AUDIO_BUCKET_CREATE_FAILED');
      } else {
        const { error } = await client.storage.updateBucket(config.bucket, {
          public: false,
          allowedMimeTypes: ALLOWED_AUDIO_MIME_TYPES,
          fileSizeLimit: config.maxBytes,
        });
        if (error) throw new Error('AUDIO_BUCKET_PRIVACY_FAILED');
      }

      const { data: verified, error: verifyError } =
        await client.storage.getBucket(config.bucket);
      if (verifyError || !verified || verified.public) {
        throw new Error('AUDIO_BUCKET_NOT_PRIVATE');
      }

      /*
       * Si verifica anche il tetto, non solo la privatezza.
       *
       * Qui sopra si chiede un bucket da `maxBytes` (128 MB di default) e
       * Supabase **non protesta** se il progetto ha un limite globale piu'
       * basso: accetta la chiamata e tiene il valore che gli pare. Il bucket
       * di produzione e' rimasto a 50 MB per mesi mentre il codice era
       * convinto di averne chiesti 128, e nessuno poteva accorgersene perche'
       * l'unica cosa che si rileggeva era `public`.
       *
       * Il conto lo ha pagato la seduta del 16 agosto: la traccia dell'atleta
       * ha superato i 50 MB, S3 ha risposto `413 EntityTooLarge`, e non si e'
       * persa l'eccedenza ma l'intero file — e con esso il riepilogo di
       * un'ora di seduta.
       *
       * Non si blocca la registrazione: un tetto piu' basso registra comunque
       * le sedute corte, e rifiutare tutto sarebbe un danno peggiore. Ma il
       * disallineamento non resta piu' muto.
       */
      const effettivo = verified.file_size_limit ?? null;
      if (effettivo !== null && effettivo < config.maxBytes) {
        console.error(
          '[ai-notes] il bucket audio ha un tetto piu' +
            ' basso di quello richiesto: alzare il limite di upload del ' +
            'progetto Supabase, altrimenti le sedute lunghe perdono il file',
          {
            bucket: config.bucket,
            richiesto: config.maxBytes,
            effettivo,
          }
        );
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

/**
 * URL temporanea verso un oggetto privato.
 *
 * Non raggiunge mai il browser: l'unico destinatario è il provider STT, che
 * la usa per scaricare l'audio da sé. Il bucket resta privato e la firma
 * scade.
 */
export async function createAudioObjectSignedUrl(
  config: AudioRecordingConfig,
  key: string,
  expiresInSeconds: number
): Promise<string> {
  splitObjectKey(key);
  const { data, error } = await storageClient(config)
    .storage.from(config.bucket)
    .createSignedUrl(key, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error('AUDIO_OBJECT_SIGNED_URL_FAILED');
  }
  return data.signedUrl;
}

/** Caricamento server-only nel bucket privato. */
export async function uploadAudioObject(
  config: AudioRecordingConfig,
  key: string,
  bytes: Buffer,
  mimeType: string
): Promise<void> {
  splitObjectKey(key);
  const { error } = await storageClient(config)
    .storage.from(config.bucket)
    .upload(key, bytes, { contentType: mimeType, upsert: false });
  if (error) throw new Error('AUDIO_OBJECT_UPLOAD_FAILED');
}

export function createProductionAudioStorage(config: AudioRecordingConfig): AudioStorage {
  return {
    upload: (key, bytes, mimeType) =>
      uploadAudioObject(config, key, bytes, mimeType),
    inspect: (key) => inspectAudioObject(config, key),
    download: (key) => downloadAudioObject(config, key),
    deleteAndVerify: (key) => deleteAudioObjectAndVerify(config, key),
    createSignedUrl: (key, expiresInSeconds) =>
      createAudioObjectSignedUrl(config, key, expiresInSeconds),
  };
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

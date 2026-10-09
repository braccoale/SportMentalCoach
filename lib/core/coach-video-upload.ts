/**
 * Le regole del video di presentazione del coach: cosa si può registrare o
 * caricare, quanto può durare e pesare, dove si salva e quali file sono suoi.
 *
 * Il video non passa dal server: una funzione Vercel non accetta richieste
 * oltre i 4,5 MB, quindi un video vero non arriverebbe mai. Il server firma un
 * indirizzo di caricamento per un percorso deciso da lui e il browser carica
 * direttamente su Supabase Storage. Per questo i controlli di tipo, peso e
 * durata stanno qui, in un modulo che il browser e il server leggono uguale.
 *
 * Modulo puro, senza `server-only`.
 */

/** Durata massima: 2 minuti, sia per la registrazione sia per un file caricato. */
export const COACH_VIDEO_MAX_SECONDS = 120;

/**
 * Peso massimo: 45 MB. Il progetto Supabase ha oggi un tetto di upload globale
 * a 50 MB (stessa ragione dell'Academy, vedi `lib/core/storage.ts`): promettere
 * di più vorrebbe dire perdere il file in silenzio all'ultimo momento.
 */
export const COACH_VIDEO_MAX_BYTES = 45 * 1024 * 1024;

/** Formati che i browser riproducono: MP4 (H.264), WebM e MOV di iPhone. */
export const COACH_VIDEO_ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export type CoachVideoType = (typeof COACH_VIDEO_ALLOWED_TYPES)[number];

const EXTENSION: Record<CoachVideoType, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** Il tipo MIME senza i parametri («video/webm;codecs=vp9» → «video/webm»). */
export function baseVideoType(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

export function isAllowedVideoType(type: string): boolean {
  return (COACH_VIDEO_ALLOWED_TYPES as readonly string[]).includes(baseVideoType(type));
}

export function extensionForVideoType(type: string): string {
  const base = baseVideoType(type);
  return isAllowedVideoType(base) ? EXTENSION[base as CoachVideoType] : 'mp4';
}

export type VideoCheck = { ok: true } | { ok: false; error: string };

/**
 * Un video si può pubblicare? `durationSec` è facoltativa (il browser a volte
 * non riesce a leggerla): se manca, passa; se c'è, deve stare nel tetto, con un
 * secondo di tolleranza.
 */
export function validateVideo(input: { type: string; size: number; durationSec?: number | null }): VideoCheck {
  if (!isAllowedVideoType(input.type)) {
    return { ok: false, error: 'Formato non supportato. Usa un video MP4, WebM o MOV.' };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: 'Il file è vuoto.' };
  }
  if (input.size > COACH_VIDEO_MAX_BYTES) {
    return {
      ok: false,
      error: `Il video pesa troppo (massimo ${Math.round(COACH_VIDEO_MAX_BYTES / (1024 * 1024))} MB). Prova con uno più corto.`,
    };
  }
  if (
    input.durationSec != null &&
    Number.isFinite(input.durationSec) &&
    input.durationSec > COACH_VIDEO_MAX_SECONDS + 1
  ) {
    return { ok: false, error: `Il video dura troppo (massimo ${COACH_VIDEO_MAX_SECONDS / 60} minuti).` };
  }
  return { ok: true };
}

/**
 * Il formato migliore per registrare, fra quelli che il browser sa scrivere:
 * MP4 (Safari e iPhone lo vogliono, e lo riproducono tutti) poi WebM.
 * `isSupported` è `MediaRecorder.isTypeSupported`.
 */
export function pickRecorderMimeType(isSupported: (type: string) => boolean): string | null {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((c) => isSupported(c)) ?? null;
}

/** Il percorso di un nuovo video nello storage: sempre sotto `videos/` e con l'id del coach. */
export function buildVideoKey(userId: number, now: number, type: string): string {
  return `videos/intro-${userId}-${now}.${extensionForVideoType(type)}`;
}

/** Il percorso appartiene a questo coach? Serve prima di cancellare un file: mai quello di un altro. */
export function isOwnVideoKey(userId: number, key: string): boolean {
  return new RegExp(`^videos/intro-${userId}-\\d+\\.(mp4|webm|mov)$`).test(key);
}

/**
 * Dall'indirizzo pubblico di un file nel bucket al suo percorso, o `null` se
 * l'indirizzo non è di quel bucket (un link esterno, un file locale…).
 */
export function storageKeyFromPublicUrl(url: string, supabaseUrl: string, bucket: string): string | null {
  try {
    const prefix = `${new URL(supabaseUrl).origin}/storage/v1/object/public/${bucket}/`;
    if (!url.startsWith(prefix)) return null;
    const key = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
    return key && !key.includes('..') ? key : null;
  } catch {
    return null;
  }
}

/** Secondi in «m:ss» per il cronometro della registrazione. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

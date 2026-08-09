import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  sessionAiNotes,
  sessionCoachVoiceNotes,
} from '@/lib/db/schema';
import { getAudioRecordingConfig } from './recording-config';
import { createProductionAudioStorage } from './audio-storage';
import { getSpeechToTextProvider } from './providers';
import { sttCallbackUrl, SIGNED_URL_TTL_SECONDS } from './transcription-dispatch';
import { AiNotesDomainError } from './state-machine';

/**
 * Note vocali del coach.
 *
 * Stesso percorso dell'audio di sessione — storage privato, url firmata,
 * Deepgram in callback — ma con il proprio registro: una nota vocale non è un
 * segmento di registrazione e non deve entrare nelle tabelle che governano
 * quelle.
 */

/** Un minuto e mezzo: oltre, non è più una nota, è un monologo. */
export const MAX_VOICE_NOTE_BYTES = 8 * 1024 * 1024;

export type CoachVoiceNote = {
  id: number;
  status: string;
  transcript: string | null;
  durationMs: number | null;
  createdAt: string;
};

async function assertCoachOwnsSession(
  sessionId: number,
  actorUserId: number,
  executor: DbOrTx
): Promise<void> {
  const [row] = await executor
    .select({ coachUserId: providerProfiles.userId })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);
  // 404 e non 403: chi sonda non deve distinguere una sessione altrui da una
  // inesistente.
  if (!row || row.coachUserId !== actorUserId) {
    throw new AiNotesDomainError('NOT_FOUND', 'Sessione AI non trovata.');
  }
}

/**
 * Salva l'audio e lo consegna al provider.
 *
 * La nota resta utilizzabile anche se la trascrizione fallisce: l'audio è
 * salvato prima, e il coach può comunque riascoltarsi. Il testo è un di più,
 * non la sostanza.
 */
export async function createCoachVoiceNote(
  params: {
    sessionId: number;
    actorUserId: number;
    audio: Buffer;
    mimeType: string;
    durationMs: number | null;
  },
  executor: DbOrTx = db
): Promise<CoachVoiceNote> {
  await assertCoachOwnsSession(params.sessionId, params.actorUserId, executor);
  if (params.audio.byteLength === 0) {
    throw new AiNotesDomainError('RECORDING_FAILED', 'Nota vocale vuota.');
  }
  if (params.audio.byteLength > MAX_VOICE_NOTE_BYTES) {
    throw new AiNotesDomainError('RECORDING_FAILED', 'Nota vocale troppo lunga.');
  }

  const config = getAudioRecordingConfig();
  const storage = createProductionAudioStorage(config);
  const objectKey = `voice-notes/${params.sessionId}/${randomBytes(16).toString('hex')}.webm`;
  await storage.upload(objectKey, params.audio, params.mimeType);

  const [created] = await executor
    .insert(sessionCoachVoiceNotes)
    .values({
      sessionAiNotesId: params.sessionId,
      storageBucket: config.bucket,
      storageObjectKey: objectKey,
      durationMs: params.durationMs,
      sizeBytes: params.audio.byteLength,
      status: 'pending',
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .returning({
      id: sessionCoachVoiceNotes.id,
      createdDate: sessionCoachVoiceNotes.createdDate,
    });
  if (!created) {
    throw new AiNotesDomainError('RECORDING_FAILED', 'Nota vocale non salvata.');
  }

  let status = 'pending';
  try {
    const token = randomBytes(32).toString('hex');
    const audioUrl = await storage.createSignedUrl(
      objectKey,
      SIGNED_URL_TTL_SECONDS
    );
    const submission = await getSpeechToTextProvider().provider.submit({
      audioUrl,
      callbackUrl: `${sttCallbackUrl(token)}?kind=voice-note`,
      language: 'it',
      model: process.env.AI_NOTES_STT_MODEL?.trim() || 'nova-3',
    });
    await executor
      .update(sessionCoachVoiceNotes)
      .set({
        status: 'transcribing',
        callbackToken: token,
        providerRequestId: submission.providerRequestId,
        updatedDate: new Date(),
      })
      .where(eq(sessionCoachVoiceNotes.id, created.id));
    status = 'transcribing';
  } catch (error) {
    // L'audio resta: la nota vale anche senza testo.
    console.error('[voice-note] consegna al provider non riuscita', error);
    await executor
      .update(sessionCoachVoiceNotes)
      .set({
        status: 'failed',
        errorCode: 'TRANSCRIPTION_SUBMIT_FAILED',
        updatedDate: new Date(),
      })
      .where(eq(sessionCoachVoiceNotes.id, created.id));
    status = 'failed';
  }

  return {
    id: created.id,
    status,
    transcript: null,
    durationMs: params.durationMs,
    createdAt: created.createdDate.toISOString(),
  };
}

/** Ingerisce la trascrizione di una nota vocale. Idempotente per token. */
export async function ingestVoiceNoteTranscript(
  params: { token: string; text: string; providerRequestId?: string },
  executor: DbOrTx = db
): Promise<boolean> {
  const [note] = await executor
    .select({
      id: sessionCoachVoiceNotes.id,
      status: sessionCoachVoiceNotes.status,
      providerRequestId: sessionCoachVoiceNotes.providerRequestId,
    })
    .from(sessionCoachVoiceNotes)
    .where(eq(sessionCoachVoiceNotes.callbackToken, params.token))
    .limit(1);
  if (!note || note.status !== 'transcribing') return false;
  if (
    note.providerRequestId &&
    params.providerRequestId &&
    note.providerRequestId !== params.providerRequestId
  ) {
    return false;
  }
  const [claimed] = await executor
    .update(sessionCoachVoiceNotes)
    .set({
      status: 'ready',
      transcript: params.text,
      updatedDate: new Date(),
    })
    .where(
      and(
        eq(sessionCoachVoiceNotes.id, note.id),
        eq(sessionCoachVoiceNotes.status, 'transcribing')
      )
    )
    .returning({ id: sessionCoachVoiceNotes.id });
  return Boolean(claimed);
}

export async function listCoachVoiceNotes(
  sessionId: number,
  actorUserId: number,
  executor: DbOrTx = db
): Promise<CoachVoiceNote[]> {
  try {
    await assertCoachOwnsSession(sessionId, actorUserId, executor);
  } catch {
    return [];
  }
  const rows = await executor
    .select({
      id: sessionCoachVoiceNotes.id,
      status: sessionCoachVoiceNotes.status,
      transcript: sessionCoachVoiceNotes.transcript,
      durationMs: sessionCoachVoiceNotes.durationMs,
      createdDate: sessionCoachVoiceNotes.createdDate,
    })
    .from(sessionCoachVoiceNotes)
    .where(eq(sessionCoachVoiceNotes.sessionAiNotesId, sessionId))
    .orderBy(asc(sessionCoachVoiceNotes.createdDate));
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    transcript: row.transcript,
    durationMs: row.durationMs,
    createdAt: row.createdDate.toISOString(),
  }));
}

/** Le trascrizioni delle note vocali. Come sopra: nessun utente dietro. */
export async function listSessionVoiceNoteTranscripts(
  sessionId: number,
  executor: DbOrTx = db
): Promise<string[]> {
  const rows = await executor
    .select({ transcript: sessionCoachVoiceNotes.transcript })
    .from(sessionCoachVoiceNotes)
    .where(eq(sessionCoachVoiceNotes.sessionAiNotesId, sessionId))
    .orderBy(asc(sessionCoachVoiceNotes.createdDate));
  return rows
    .map((row) => row.transcript)
    .filter((text): text is string => Boolean(text?.trim()));
}

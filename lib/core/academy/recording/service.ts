/**
 * Registrazione automatica delle sessioni Academy: consenso del docente →
 * egress room-composite (audio misto, un file per sessione) → trascrizione
 * Deepgram → recap generato da `../recap/service`.
 *
 * A differenza della pipeline delle prenotazioni (`ai-session-notes`), qui
 * non serve separare le voci — il recap non attribuisce citazioni a un
 * parlante — quindi un solo file audio e una sola richiesta di trascrizione
 * bastano. Niente coda di job: una sessione Academy ha una registrazione,
 * non una per partecipante.
 *
 * La videochiamata stessa non cambia: la stanza è la stessa identica cosa
 * già in produzione tra coach e atleta. Solo questo modulo, il consenso e
 * la stanza in più persone sono nuovi.
 */
import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  academySessionRecordings,
  academySessions,
  type AcademyRecordingStatus,
} from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';
import {
  getAudioRecordingConfig,
  type AudioRecordingConfig,
} from '../../ai-session-notes/recording-config';
import {
  createAudioObjectSignedUrl,
  ensureAudioBucketPrivate,
} from '../../ai-session-notes/audio-storage';
import { getSpeechToTextProvider, parseDeepgramUtterances } from '../../ai-session-notes/providers';
import { normalizedCallbackBase } from '../../ai-session-notes/transcription-dispatch';
import { AiNotesProcessingError } from '../../ai-session-notes/processing-policy';
import { generateRecap } from '../recap/service';
import {
  AcademyRecordingDomainError,
  academyRecordingTransitionPatch,
  assertAcademyRecordingTransition,
} from './state-machine';
import {
  ProductionAcademyLiveKitControl,
  type AcademyLiveKitControl,
} from './livekit-control';

/** Quindici minuti: stesso margine della pipeline prenotazioni — il provider scarica subito. */
const SIGNED_URL_TTL_SECONDS = 900;

export type AcademyRecordingState = {
  id: number;
  sessionId: number;
  courseId: number;
  status: AcademyRecordingStatus;
  consentGivenAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  processingCompletedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
};

function toState(row: typeof academySessionRecordings.$inferSelect): AcademyRecordingState {
  return {
    id: row.id,
    sessionId: row.sessionId,
    courseId: row.courseId,
    status: row.status as AcademyRecordingStatus,
    consentGivenAt: row.consentGivenAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    processingCompletedAt: row.processingCompletedAt,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
  };
}

function academyRoomName(sessionId: number): string {
  return `academy-session-${sessionId}`;
}

function academyRecordingSttCallbackUrl(token: string): string {
  const base = process.env.AI_NOTES_CALLBACK_BASE_URL?.trim();
  if (!base) {
    throw new AiNotesProcessingError('PROVIDER_NOT_CONFIGURED', 'URL di callback non configurata.');
  }
  return `${normalizedCallbackBase(base)}/api/academy/recording/stt-callback/${token}`;
}

async function assertSessionInstructorOrAdmin(
  actorUserId: number,
  sessionId: number
): Promise<{ courseId: number; instructorUserId: number }> {
  const [session] = await db
    .select({ courseId: academySessions.courseId, instructorUserId: academySessions.instructorUserId })
    .from(academySessions)
    .where(eq(academySessions.id, sessionId))
    .limit(1);
  if (!session) throw new AcademyRecordingDomainError('NOT_FOUND', 'Sessione non trovata.');
  if (session.instructorUserId === actorUserId) return session;
  try {
    await assertAdmin(actorUserId);
    return session;
  } catch {
    throw new AcademyRecordingDomainError('FORBIDDEN', 'Solo il docente della sessione o un admin possono gestire la registrazione.');
  }
}

/** Stato attuale — `null` quando la registrazione non è mai stata avviata né rifiutata. */
export async function getRecordingState(sessionId: number): Promise<AcademyRecordingState | null> {
  const [row] = await db
    .select()
    .from(academySessionRecordings)
    .where(eq(academySessionRecordings.sessionId, sessionId))
    .limit(1);
  return row ? toState(row) : null;
}

/**
 * Il docente dà il consenso e la registrazione parte subito: un solo egress
 * room-composite, audio-only, sull'intera stanza. Solo dallo stato iniziale o
 * da un tentativo già rifiutato/annullato in precedenza (una nuova sessione
 * riusa lo stesso id di stanza solo se la precedente riga non è mai arrivata
 * a registrare — vedi il vincolo di unicità su `session_id`).
 */
export async function giveConsentAndStartRecording(params: {
  actorUserId: number;
  sessionId: number;
  liveKitControl?: AcademyLiveKitControl;
  config?: AudioRecordingConfig;
}): Promise<AcademyRecordingState> {
  const { courseId } = await assertSessionInstructorOrAdmin(params.actorUserId, params.sessionId);
  const roomName = academyRoomName(params.sessionId);

  const [existing] = await db
    .select()
    .from(academySessionRecordings)
    .where(eq(academySessionRecordings.sessionId, params.sessionId))
    .limit(1);

  const currentStatus = (existing?.status as AcademyRecordingStatus | undefined) ?? 'waiting_for_consent';
  assertAcademyRecordingTransition(currentStatus, 'recording');

  const config = params.config ?? getAudioRecordingConfig();
  await ensureAudioBucketPrivate(config);
  const control = params.liveKitControl ?? new ProductionAcademyLiveKitControl(config);
  const objectKey = `academy-recordings/${courseId}/${params.sessionId}/${Date.now()}.ogg`;

  let egressId: string;
  try {
    const result = await control.startRoomCompositeEgress({ roomName, objectKey });
    egressId = result.egressId;
  } catch {
    throw new AcademyRecordingDomainError('EGRESS_START_FAILED', 'Impossibile avviare la registrazione della sessione.');
  }

  const now = new Date();
  const patch = academyRecordingTransitionPatch('recording', params.actorUserId, now, currentStatus);
  const values = {
    sessionId: params.sessionId,
    courseId,
    roomName,
    egressId,
    audioObjectKey: objectKey,
    consentGivenBy: params.actorUserId,
    consentGivenAt: now,
    createdBy: params.actorUserId,
    ...patch,
  };

  const [row] = existing
    ? await db
        .update(academySessionRecordings)
        .set(values)
        .where(eq(academySessionRecordings.id, existing.id))
        .returning()
    : await db.insert(academySessionRecordings).values(values).returning();

  // Chi ha in mano un id sa che l'inserimento non può che tornare la riga: fallirebbe prima.
  return toState(row!);
}

/** Il docente rifiuta: nessuna registrazione per questa sessione. Stato terminale. */
export async function declineConsent(params: { actorUserId: number; sessionId: number }): Promise<AcademyRecordingState> {
  const { courseId } = await assertSessionInstructorOrAdmin(params.actorUserId, params.sessionId);

  const [existing] = await db
    .select()
    .from(academySessionRecordings)
    .where(eq(academySessionRecordings.sessionId, params.sessionId))
    .limit(1);
  const currentStatus = (existing?.status as AcademyRecordingStatus | undefined) ?? 'waiting_for_consent';
  assertAcademyRecordingTransition(currentStatus, 'consent_rejected');

  const now = new Date();
  const patch = academyRecordingTransitionPatch('consent_rejected', params.actorUserId, now, currentStatus);
  const values = {
    sessionId: params.sessionId,
    courseId,
    roomName: academyRoomName(params.sessionId),
    createdBy: params.actorUserId,
    ...patch,
  };

  const [row] = existing
    ? await db
        .update(academySessionRecordings)
        .set(values)
        .where(eq(academySessionRecordings.id, existing.id))
        .returning()
    : await db.insert(academySessionRecordings).values(values).returning();
  return toState(row!);
}

/**
 * Chiamata dal webhook LiveKit quando l'egress di una stanza Academy termina.
 * `egressFailed` distingue un esito negativo riportato da LiveKit stesso —
 * in quel caso non esiste alcun file da trascrivere, e si va direttamente a
 * `failed` invece che a `processing`.
 */
export async function handleAcademyEgressEnded(params: {
  egressId: string;
  egressFailed: boolean;
  errorDetail?: string;
}): Promise<void> {
  const [row] = await db
    .select()
    .from(academySessionRecordings)
    .where(eq(academySessionRecordings.egressId, params.egressId))
    .limit(1);
  if (!row) return; // Non è una registrazione Academy nostra: ignorata, non è un errore.

  const currentStatus = row.status as AcademyRecordingStatus;
  if (currentStatus !== 'recording') return; // consegna duplicata del webhook

  const now = new Date();
  if (params.egressFailed) {
    assertAcademyRecordingTransition(currentStatus, 'failed');
    await db
      .update(academySessionRecordings)
      .set({
        ...academyRecordingTransitionPatch('failed', row.consentGivenBy ?? row.createdBy ?? 0, now, currentStatus),
        errorCode: 'EGRESS_FAILED',
        errorMessage: (params.errorDetail ?? 'La registrazione non è riuscita.').slice(0, 300),
      })
      .where(eq(academySessionRecordings.id, row.id));
    return;
  }

  assertAcademyRecordingTransition(currentStatus, 'processing');
  const actorUserId = row.consentGivenBy ?? row.createdBy ?? 0;
  await db
    .update(academySessionRecordings)
    .set(academyRecordingTransitionPatch('processing', actorUserId, now, currentStatus))
    .where(eq(academySessionRecordings.id, row.id));

  await submitForTranscription(row.id).catch((error) => {
    console.error('[academy recording] invio a trascrizione non riuscito', {
      recordingId: row.id,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
  });
}

/** Invia l'audio già caricato al provider STT, con callback dedicata. Separata per essere richiamabile in caso di riapertura. */
async function submitForTranscription(recordingId: number): Promise<void> {
  const [row] = await db
    .select()
    .from(academySessionRecordings)
    .where(eq(academySessionRecordings.id, recordingId))
    .limit(1);
  if (!row || row.status !== 'processing' || !row.audioObjectKey) return;

  const config = getAudioRecordingConfig();
  const { provider } = getSpeechToTextProvider();
  const token = randomBytes(32).toString('hex');
  const audioUrl = await createAudioObjectSignedUrl(config, row.audioObjectKey, SIGNED_URL_TTL_SECONDS);

  try {
    await provider.submit({
      audioUrl,
      callbackUrl: academyRecordingSttCallbackUrl(token),
      language: 'it',
      model: process.env.AI_NOTES_STT_MODEL?.trim() || 'nova-3',
    });
  } catch (error) {
    const now = new Date();
    await db
      .update(academySessionRecordings)
      .set({
        ...academyRecordingTransitionPatch('failed', row.updatedBy ?? row.consentGivenBy ?? 0, now, 'processing'),
        errorCode: 'TRANSCRIPTION_SUBMIT_FAILED',
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : 'Invio a trascrizione non riuscito.',
      })
      .where(eq(academySessionRecordings.id, row.id));
    return;
  }

  await db
    .update(academySessionRecordings)
    .set({ sttCallbackToken: token, transcriptionSubmittedAt: new Date(), updatedDate: new Date() })
    .where(eq(academySessionRecordings.id, row.id));
}

/**
 * Riapertura esplicita di una registrazione fallita dopo la registrazione
 * vera e propria — cioè quando l'audio è già in bucket ma l'invio o
 * l'ingestione della trascrizione non sono andati a buon fine. Non
 * automatica per scelta, stessa filosofia di `ai-notes:reopen`: un guasto
 * terminale e una consegna mai arrivata sono indistinguibili dall'esterno,
 * quindi la ripartenza è un gesto di chi la richiede, non un retry silenzioso.
 */
export async function retryAcademyTranscription(params: {
  actorUserId: number;
  sessionId: number;
}): Promise<AcademyRecordingState> {
  await assertSessionInstructorOrAdmin(params.actorUserId, params.sessionId);

  const [row] = await db
    .select()
    .from(academySessionRecordings)
    .where(eq(academySessionRecordings.sessionId, params.sessionId))
    .limit(1);
  if (!row) throw new AcademyRecordingDomainError('NOT_FOUND', 'Nessuna registrazione da riprendere per questa sessione.');
  if (!row.audioObjectKey) {
    throw new AcademyRecordingDomainError('EGRESS_MISMATCH', 'Nessun audio registrato da poter trascrivere di nuovo.');
  }

  const currentStatus = row.status as AcademyRecordingStatus;
  assertAcademyRecordingTransition(currentStatus, 'processing');

  const now = new Date();
  const [updated] = await db
    .update(academySessionRecordings)
    .set(academyRecordingTransitionPatch('processing', params.actorUserId, now, currentStatus))
    .where(eq(academySessionRecordings.id, row.id))
    .returning();

  await submitForTranscription(row.id);
  return toState(updated!);
}

export type CallbackOutcome = 'ingested' | 'duplicate' | 'unknown';

/**
 * Ingestione della callback Deepgram: unisce le utterance in un testo piano
 * e chiama `generateRecap` con l'identità del docente che ha dato il
 * consenso — la stessa persona che avrebbe generato il recap a mano nell'MVP
 * precedente, quindi la stessa autorizzazione si applica senza aggiunte.
 *
 * `processingCompletedAt IS NULL` è il punto di serializzazione: Deepgram
 * ritenta fino a dieci volte se non riceve un 2xx, e una seconda ingestione
 * non deve rigenerare il recap una seconda volta.
 */
export async function ingestAcademyTranscriptionCallback(params: {
  token: string;
  payload: unknown;
}): Promise<CallbackOutcome> {
  if (!/^[a-f0-9]{64}$/.test(params.token)) return 'unknown';

  const [row] = await db
    .select()
    .from(academySessionRecordings)
    .where(eq(academySessionRecordings.sttCallbackToken, params.token))
    .limit(1);
  if (!row) return 'unknown';
  if (row.status !== 'processing') return 'duplicate';

  // Marca `processingCompletedAt` per rivendicare la callback prima di fare
  // qualunque lavoro: una seconda consegna concorrente non trova più la riga
  // in questo stato e si ferma qui, senza generare due volte il recap.
  const [claimed] = await db
    .update(academySessionRecordings)
    .set({ processingCompletedAt: new Date(), updatedDate: new Date() })
    .where(
      and(
        eq(academySessionRecordings.id, row.id),
        eq(academySessionRecordings.status, 'processing'),
        isNull(academySessionRecordings.processingCompletedAt)
      )
    )
    .returning();
  if (!claimed) return 'duplicate';

  const now = new Date();
  const actorUserId = row.consentGivenBy ?? row.createdBy ?? 0;

  let transcriptText: string;
  try {
    const parsed = parseDeepgramUtterances(params.payload, row.id);
    transcriptText = parsed.segments.map((segment) => segment.text).join(' ').trim();
    if (!transcriptText) throw new Error('EMPTY_TRANSCRIPT');
  } catch (error) {
    await db
      .update(academySessionRecordings)
      .set({
        ...academyRecordingTransitionPatch('failed', actorUserId, now, 'processing'),
        errorCode: 'TRANSCRIPTION_CALLBACK_INVALID',
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : 'Trascrizione non valida.',
      })
      .where(eq(academySessionRecordings.id, row.id));
    return 'ingested';
  }

  try {
    await generateRecap({
      actorUserId,
      sessionId: row.sessionId,
      courseId: row.courseId,
      transcriptText,
    });
  } catch (error) {
    // generateRecap scrive già lo stato 'failed' sul recap quando il
    // provider fallisce: qui arriva solo un errore prima di quel punto
    // (sessione sparita, autorizzazione), quindi la registrazione stessa va
    // marcata fallita — la trascrizione però è andata a buon fine.
    await db
      .update(academySessionRecordings)
      .set({
        ...academyRecordingTransitionPatch('failed', actorUserId, now, 'processing'),
        errorCode: 'RECAP_GENERATION_FAILED',
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : 'Generazione del recap non riuscita.',
      })
      .where(eq(academySessionRecordings.id, row.id));
    return 'ingested';
  }

  await db
    .update(academySessionRecordings)
    .set(academyRecordingTransitionPatch('ready', actorUserId, now, 'processing'))
    .where(eq(academySessionRecordings.id, row.id));
  return 'ingested';
}

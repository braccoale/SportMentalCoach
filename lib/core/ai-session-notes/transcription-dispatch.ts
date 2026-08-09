import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import {
  sessionAudioRecordings,
  sessionTranscriptSegments,
  sessionTranscriptionRequests,
} from '@/lib/db/schema';
import { getAiNotesAudioMaxBytes } from './recording-config';
import { AiNotesProcessingError } from './processing-policy';
import { ingestTranscriptionCallback } from './stt-callback';
import { logPipeline, pipelineErrorCode } from './pipeline-log';
import type { AiSessionNotesDependencies } from './dependencies';

/**
 * Quindici minuti: il provider scarica subito dopo aver accettato la
 * richiesta, e una finestra più larga terrebbe l'audio raggiungibile senza
 * motivo.
 */
export const SIGNED_URL_TTL_SECONDS = 900;

/**
 * URL a cui il provider consegnerà i risultati.
 *
 * Deve essere raggiungibile da internet: in sviluppo locale serve un tunnel,
 * altrimenti le trascrizioni non tornano mai.
 */
/**
 * La base dell'indirizzo di callback, normalizzata.
 *
 * Il prefisso mancante e' costato giorni: la variabile conteneva l'host
 * nudo, l'indirizzo che ne usciva non era assoluto, e Deepgram rifiutava
 * ogni consegna con un errore che non diceva quale campo fosse sbagliato.
 * Un valore scritto senza `https://` e' un errore di battitura, non una
 * scelta: si corregge invece di far fallire tutto.
 *
 * `http` invece resta un errore: il provider non ci arriverebbe comunque, e
 * accettarlo in silenzio significherebbe riavere lo stesso guasto travestito.
 */
export function normalizedCallbackBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'https:') {
    throw new AiNotesProcessingError(
      'PROVIDER_NOT_CONFIGURED',
      'URL di callback non sicura.'
    );
  }
  return url.origin;
}

export function sttCallbackUrl(token: string): string {
  const base = process.env.AI_NOTES_CALLBACK_BASE_URL?.trim();
  if (!base) {
    throw new AiNotesProcessingError(
      'PROVIDER_NOT_CONFIGURED',
      'URL di callback non configurata.'
    );
  }
  return `${normalizedCallbackBase(base)}/api/internal/ai-notes/stt-callback/${token}`;
}

export type DispatchOutcome = {
  /** Richieste inviate in questa passata. */
  submitted: number;
  /** Segmenti non ancora trascritti: inviati ora, già in attesa, o non pronti. */
  remaining: number;
};

/**
 * Invia al provider tutti i segmenti del partecipante non ancora trascritti
 * e non già in attesa di risposta.
 *
 * Non scarica mai l'audio: consegna una URL firmata e lascia che sia il
 * provider a scaricare. È ciò che porta l'invocazione da decine di secondi a
 * circa uno, e che rende la durata della sessione irrilevante.
 */
export async function dispatchPendingTranscriptionRequests(
  job: {
    id: number;
    sessionAiNotesId: number;
    participantRecordingId: number;
    provider: string;
  },
  dependencies: AiSessionNotesDependencies
): Promise<DispatchOutcome> {
  const maxAudioBytes = getAiNotesAudioMaxBytes();
  const model = process.env.AI_NOTES_STT_MODEL?.trim() || 'nova-3';
  if (model !== 'nova-3') {
    throw new AiNotesProcessingError('INVALID_JOB', 'Modello STT non consentito.');
  }

  const rows = await dependencies.db
    .select({
      id: sessionAudioRecordings.id,
      participantRecordingId: sessionAudioRecordings.participantRecordingId,
      status: sessionAudioRecordings.status,
      objectKey: sessionAudioRecordings.storageObjectKey,
      mimeType: sessionAudioRecordings.mimeType,
      sizeBytes: sessionAudioRecordings.sizeBytes,
      checksum: sessionAudioRecordings.checksum,
    })
    .from(sessionAudioRecordings)
    .where(
      and(
        eq(sessionAudioRecordings.sessionAiNotesId, job.sessionAiNotesId),
        eq(
          sessionAudioRecordings.participantRecordingId,
          job.participantRecordingId
        )
      )
    )
    .orderBy(asc(sessionAudioRecordings.segmentOrder), asc(sessionAudioRecordings.id));

  let submitted = 0;
  let remaining = 0;

  for (const row of rows) {
    if (row.participantRecordingId !== job.participantRecordingId) continue;

    const already = await dependencies.db
      .select({ id: sessionTranscriptSegments.id })
      .from(sessionTranscriptSegments)
      .where(
        and(
          eq(sessionTranscriptSegments.physicalRecordingId, row.id),
          eq(sessionTranscriptSegments.provider, job.provider)
        )
      )
      .limit(1);
    if (already.length) continue;

    const live = await dependencies.db
      .select({ id: sessionTranscriptionRequests.id })
      .from(sessionTranscriptionRequests)
      .where(
        and(
          eq(sessionTranscriptionRequests.physicalRecordingId, row.id),
          eq(sessionTranscriptionRequests.status, 'submitted')
        )
      )
      .limit(1);
    if (live.length) {
      remaining += 1;
      continue;
    }

    if (row.status !== 'recorded') {
      // Un segmento ancora aperto non è un errore: la sessione può essere in
      // corso. Si conta come mancante e si riproverà.
      remaining += 1;
      continue;
    }
    if (
      row.mimeType !== 'audio/ogg' ||
      row.sizeBytes === null ||
      row.sizeBytes <= 0 ||
      row.sizeBytes > maxAudioBytes
    ) {
      throw new AiNotesProcessingError('UNSUPPORTED_AUDIO', 'Formato o dimensione audio non supportati.');
    }

    const inspected = await dependencies.audioStorage.inspect(row.objectKey);
    if (!inspected.exists) {
      throw new AiNotesProcessingError('AUDIO_NOT_FOUND', 'File audio non trovato.');
    }
    if (
      inspected.sizeBytes !== row.sizeBytes ||
      (row.checksum && inspected.checksum && row.checksum !== inspected.checksum)
    ) {
      throw new AiNotesProcessingError('AUDIO_INTEGRITY_FAILED', 'Integrità file audio non verificata.');
    }

    const previous = await dependencies.db
      .select({ id: sessionTranscriptionRequests.id })
      .from(sessionTranscriptionRequests)
      .where(eq(sessionTranscriptionRequests.physicalRecordingId, row.id));
    const attempt = previous.length + 1;

    const token = randomBytes(32).toString('hex');
    // Rigenerata a ogni tentativo: una reimmissione a distanza di ore non
    // deve mai dipendere da una firma vecchia.
    const audioUrl = await dependencies.audioStorage.createSignedUrl(
      row.objectKey,
      SIGNED_URL_TTL_SECONDS
    );

    let submission: { providerRequestId: string } | null = null;
    try {
      submission = await dependencies.speechToTextProvider.submit({
        audioUrl,
        callbackUrl: sttCallbackUrl(token),
        language: 'it',
        model,
      });
    } catch (error) {
      /*
       * La consegna asincrona e' stata rifiutata.
       *
       * Non e' un motivo per perdere la trascrizione. Si riprova subito per
       * la strada diretta, che e' la stessa richiesta senza callback: su un
       * audio breve ci sta comoda dentro il tetto della function, e su uno
       * lungo fallira' per tempo — ma un tentativo in piu' non toglie nulla,
       * mentre la sua assenza toglie tutto.
       *
       * Le due eccezioni che non si riprovano: una chiave sbagliata e un
       * provider non configurato falliranno identiche, e insistere sposta
       * solo il momento dell'errore.
       */
      if (
        error instanceof AiNotesProcessingError &&
        (error.code === 'PROVIDER_AUTH_FAILED' ||
          error.code === 'PROVIDER_NOT_CONFIGURED')
      ) {
        throw error;
      }
      logPipeline({
        phase: 'transcription_submit',
        outcome: 'failed',
        sessionId: job.sessionAiNotesId,
        jobId: job.id,
        errorCode: pipelineErrorCode(error),
        detail: { ripiego: 'strada diretta', registrazione: row.id },
      });
      const fallbackStartedAt = Date.now();
      const payload = await dependencies.speechToTextProvider.transcribeNow({
        audioUrl,
        language: 'it',
        model,
      });
      /*
       * Si registra la richiesta come se fosse partita e le si consegna la
       * risposta a mano: cosi' il testo entra dalla stessa porta della
       * callback, con la stessa sostituzione atomica e lo stesso avanzamento
       * del job. Nessun secondo percorso da tenere allineato.
       */
      await dependencies.db.insert(sessionTranscriptionRequests).values({
        physicalRecordingId: row.id,
        processingJobId: job.id,
        callbackToken: token,
        providerRequestId: null,
        provider: job.provider,
        status: 'submitted',
        attempt,
        submittedAt: dependencies.clock.now(),
      });
      await ingestTranscriptionCallback({ token, payload }, dependencies);
      logPipeline({
        phase: 'transcription_fallback',
        outcome: 'ok',
        sessionId: job.sessionAiNotesId,
        jobId: job.id,
        durationMs: Date.now() - fallbackStartedAt,
      });
      submitted += 1;
      continue;
    }

    await dependencies.db.insert(sessionTranscriptionRequests).values({
      physicalRecordingId: row.id,
      processingJobId: job.id,
      callbackToken: token,
      providerRequestId: submission.providerRequestId,
      provider: job.provider,
      status: 'submitted',
      attempt,
      submittedAt: dependencies.clock.now(),
    });

    logPipeline({
      phase: 'transcription_submit',
      outcome: 'ok',
      sessionId: job.sessionAiNotesId,
      jobId: job.id,
      detail: { registrazione: row.id, tentativo: attempt },
    });
    submitted += 1;
    remaining += 1;
  }

  return { submitted, remaining };
}

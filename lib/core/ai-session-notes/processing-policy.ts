import type {
  AiProcessingJobStatus,
  AiProcessingJobType,
} from '@/lib/db/schema';

export class AiNotesProcessingError extends Error {
  constructor(
    public readonly code:
      | 'PROVIDER_NOT_CONFIGURED'
      | 'SESSION_NOT_PROCESSABLE'
      | 'PARTICIPANT_RECORDING_NOT_FOUND'
      | 'INVALID_JOB'
      | 'JOB_NOT_FOUND'
      | 'AUDIO_NOT_FOUND'
      | 'AUDIO_INTEGRITY_FAILED'
      | 'UNSUPPORTED_AUDIO'
      | 'CONSENT_INVALID'
      | 'SESSION_CANCELLED'
      | 'PROVIDER_AUTH_FAILED'
      | 'PROVIDER_RATE_LIMITED'
      | 'PROVIDER_TIMEOUT'
      | 'PROVIDER_BAD_RESPONSE'
      | 'TRANSCRIPTION_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'AiNotesProcessingError';
  }
}

export function jobRequiresParticipantRecording(
  jobType: AiProcessingJobType
): boolean {
  return jobType === 'transcription';
}

export function retryStatus(params: {
  attemptCount: number;
  maxAttempts: number;
}): Extract<AiProcessingJobStatus, 'queued' | 'failed'> {
  return params.attemptCount >= params.maxAttempts ? 'failed' : 'queued';
}

/**
 * Oltre questo tempo senza risposta, una richiesta di trascrizione è
 * considerata persa.
 *
 * Volutamente più larga della finestra di ritentativi del provider (dieci
 * tentativi a trenta secondi, circa cinque minuti) sommata al tempo di
 * trascrizione di un file lungo: reimmettere troppo presto significherebbe
 * pagare e trascrivere due volte lo stesso parlato.
 */
export const STALE_TRANSCRIPTION_REQUEST_MINUTES = 20;

/**
 * Se una richiesta inviata al provider non ha più speranza di ricevere
 * risposta.
 *
 * Il provider non conserva le trascrizioni: quando una consegna si perde,
 * l'unico recupero possibile è reinviare l'audio, che resta nostro per la
 * durata della retention. Senza questo controllo una risposta mai arrivata
 * sarebbe indistinguibile da una richiesta mai partita, e la trascrizione si
 * perderebbe in silenzio.
 */
export function isTranscriptionRequestStale(params: {
  submittedAt: Date;
  now: Date;
  staleAfterMinutes: number;
}): boolean {
  const elapsedMinutes =
    (params.now.getTime() - params.submittedAt.getTime()) / 60_000;
  return elapsedMinutes > params.staleAfterMinutes;
}

/**
 * Quanto si aspetta prima di riprovare.
 *
 * Il primo tentativo aspettava un minuto pieno. Ma il primo fallimento e'
 * quasi sempre transitorio — un timeout, un rifiuto momentaneo del provider —
 * e nel frattempo c'e' un coach fermo davanti a una rotellina che non sa di
 * stare aspettando un ritentativo. Un minuto su una seduta appena finita e'
 * quasi tutto il tempo percepito.
 *
 * Quindi: cinque secondi al primo colpo, poi si allunga in fretta. Se il
 * guasto non era transitorio, dal secondo tentativo in poi l'attesa e'
 * comunque ampia e non martella il provider.
 */
export function retryDelayMs(attemptCount: number): number {
  const attempt = Math.max(1, attemptCount);
  if (attempt === 1) return 5_000;
  return Math.min(15 * 60_000, (attempt - 1) * 60_000);
}

export function sessionCanProcess(params: {
  sessionStatus: string;
  consentStatuses: string[];
}): boolean {
  return (
    !['cancelled', 'consent_rejected'].includes(params.sessionStatus) &&
    params.consentStatuses.length === 2 &&
    params.consentStatuses.every((status) => status === 'accepted')
  );
}

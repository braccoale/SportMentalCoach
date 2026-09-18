import type { AcademyRecordingStatus } from '@/lib/db/schema';

const TRANSITIONS: Record<AcademyRecordingStatus, readonly AcademyRecordingStatus[]> = {
  waiting_for_consent: ['recording', 'consent_rejected', 'cancelled'],
  /**
   * `failed` è raggiungibile anche direttamente da qui: un egress che fallisce
   * lato LiveKit non produce mai un file, quindi non passa mai da
   * `processing` — non c'è nulla da trascrivere.
   */
  recording: ['processing', 'failed', 'cancelled'],
  processing: ['ready', 'failed'],
  ready: [],
  consent_rejected: [],
  cancelled: [],
  /**
   * L'unico stato da cui si torna indietro — gemello di `report_failed`
   * nella pipeline delle prenotazioni: non vuol dire "questa sessione non
   * si può riassumere", vuol dire "il riepilogo non è mai arrivato",
   * e la trascrizione è di solito già in tabella. Mai automatica: richiede
   * un'azione esplicita che finisce nel registro come tale.
   */
  failed: ['processing'],
};

export type AcademyRecordingErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_TRANSITION'
  | 'VIDEO_NOT_CONFIGURED'
  | 'EGRESS_START_FAILED'
  | 'EGRESS_MISMATCH'
  | 'TRANSCRIPTION_SUBMIT_FAILED'
  | 'TRANSCRIPTION_CALLBACK_INVALID'
  | 'RECAP_GENERATION_FAILED';

export class AcademyRecordingDomainError extends Error {
  constructor(
    public readonly code: AcademyRecordingErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AcademyRecordingDomainError';
  }
}

export function canTransitionAcademyRecording(
  current: AcademyRecordingStatus,
  next: AcademyRecordingStatus
): boolean {
  return TRANSITIONS[current].includes(next);
}

export function assertAcademyRecordingTransition(
  current: AcademyRecordingStatus,
  next: AcademyRecordingStatus
): void {
  if (!canTransitionAcademyRecording(current, next)) {
    throw new AcademyRecordingDomainError(
      'INVALID_TRANSITION',
      `Transizione registrazione Academy non consentita: ${current} -> ${next}.`
    );
  }
}

/** Solo una registrazione ancora aperta può essere chiusa. */
export function isClosableRecordingStatus(status: string): boolean {
  return status === 'waiting_for_consent' || status === 'recording';
}

const RESET_ERROR_ON: readonly AcademyRecordingStatus[] = ['processing', 'ready'];

export function academyRecordingTransitionPatch(
  next: AcademyRecordingStatus,
  actorUserId: number,
  now = new Date(),
  /** Lo stato da cui si arriva — distingue "la registrazione è appena finita" da "si riprende un recap mai arrivato". */
  current?: AcademyRecordingStatus
) {
  return {
    status: next,
    startedAt: next === 'recording' ? now : undefined,
    endedAt:
      (next === 'processing' && current !== 'failed') ||
      (next === 'failed' && current === 'recording') ||
      next === 'cancelled' ||
      next === 'consent_rejected'
        ? now
        : undefined,
    processingCompletedAt: next === 'ready' || next === 'failed' ? now : undefined,
    errorCode: RESET_ERROR_ON.includes(next) ? null : undefined,
    errorMessage: RESET_ERROR_ON.includes(next) ? null : undefined,
    updatedDate: now,
    updatedBy: actorUserId,
  };
}

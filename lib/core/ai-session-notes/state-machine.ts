import type { AiSessionNoteStatus } from '@/lib/db/schema';

const TRANSITIONS: Record<AiSessionNoteStatus, readonly AiSessionNoteStatus[]> =
  {
    waiting_for_consent: [
      'active',
      'consent_rejected',
      'cancelled',
    ],
    active: ['processing', 'cancelled'],
    processing: [
      'ready_for_review',
      'transcription_failed',
      'report_failed',
    ],
    ready_for_review: ['approved'],
    approved: ['shared'],
    shared: [],
    consent_rejected: [],
    cancelled: [],
    transcription_failed: [],
    report_failed: [],
  };

export type AiNotesErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NOT_ENTITLED'
  | 'BOOKING_NOT_ACCEPTED'
  | 'INVALID_ROOM'
  | 'VIDEO_NOT_CONFIGURED'
  | 'OUTSIDE_CALL_WINDOW'
  | 'ALREADY_ACTIVE'
  | 'INVALID_TRANSITION'
  | 'INVALID_CONSENT'
  | 'UNVERIFIED_PARTICIPANT_PRESENT'
  | 'REQUIRED_PARTICIPANT_MISSING'
  | 'REQUIRED_AUDIO_TRACK_MISSING'
  | 'STORAGE_NOT_CONFIGURED'
  | 'RECORDING_NOT_READY'
  | 'RECORDING_FAILED';

export class AiNotesDomainError extends Error {
  constructor(
    public readonly code: AiNotesErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AiNotesDomainError';
  }
}

export function canTransitionAiNotesSession(
  current: AiSessionNoteStatus,
  next: AiSessionNoteStatus
): boolean {
  return TRANSITIONS[current].includes(next);
}

/**
 * Motivo per cui una sessione ha smesso di registrare.
 *
 * Non è decorazione: è ciò che permette al coach di sapere, a sessione
 * finita, se la registrazione si è chiusa perché l'ha decisa lui o perché è
 * scattato un limite.
 */
export type AiNotesCloseReason =
  | 'coach_closed'
  | 'room_finished'
  | 'closed_by_timeout';

/**
 * Solo una sessione ancora aperta può essere chiusa.
 *
 * `processing` e gli stati successivi hanno già smesso di registrare: una
 * seconda chiusura non deve né fallire né riscrivere il motivo della prima.
 */
export function isClosableSessionStatus(status: string): boolean {
  return status === 'active' || status === 'waiting_for_consent';
}

export function assertAiNotesTransition(
  current: AiSessionNoteStatus,
  next: AiSessionNoteStatus
): void {
  if (!canTransitionAiNotesSession(current, next)) {
    throw new AiNotesDomainError(
      'INVALID_TRANSITION',
      `Transizione Appunti AI non consentita: ${current} -> ${next}.`
    );
  }
}

export function transitionAuditPatch(
  next: AiSessionNoteStatus,
  actorUserId: number,
  now = new Date()
) {
  return {
    status: next,
    startedAt: next === 'active' ? now : undefined,
    endedAt:
      next === 'processing' ||
      next === 'cancelled' ||
      next === 'consent_rejected'
        ? now
        : undefined,
    processingStartedAt: next === 'processing' ? now : undefined,
    processingCompletedAt:
      next === 'ready_for_review' ||
      next === 'transcription_failed' ||
      next === 'report_failed'
        ? now
        : undefined,
    updatedDate: now,
    updatedBy: actorUserId,
  };
}

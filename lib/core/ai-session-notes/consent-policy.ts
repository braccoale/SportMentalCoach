import type {
  AiConsentStatus,
  AiSessionNoteStatus,
} from '@/lib/db/schema';

export type ConsentDecision = Extract<
  AiConsentStatus,
  'accepted' | 'rejected' | 'revoked'
>;

export function canActorAnswerConsent(params: {
  actorUserId: number;
  consentUserId: number;
  clientUserId: number;
  coachUserId: number;
}): boolean {
  return (
    params.actorUserId === params.consentUserId &&
    (params.actorUserId === params.clientUserId ||
      params.actorUserId === params.coachUserId)
  );
}

export function isConsentDecisionIdempotent(
  current: AiConsentStatus,
  decision: ConsentDecision
): boolean {
  return current === decision;
}

export function canApplyConsentDecision(
  current: AiConsentStatus,
  decision: ConsentDecision
): boolean {
  return (
    (current === 'pending' &&
      (decision === 'accepted' || decision === 'rejected')) ||
    (current === 'accepted' && decision === 'revoked')
  );
}

export function nextStatusAfterConsent(params: {
  sessionStatus: AiSessionNoteStatus;
  decision: ConsentDecision;
  allConsentStatuses: AiConsentStatus[];
}): AiSessionNoteStatus | null {
  if (params.decision === 'rejected') return 'consent_rejected';
  if (params.decision === 'revoked') {
    return params.sessionStatus === 'active'
      ? 'cancelled'
      : 'consent_rejected';
  }
  if (
    params.sessionStatus === 'waiting_for_consent' &&
    params.allConsentStatuses.length > 0 &&
    params.allConsentStatuses.every((status) => status === 'accepted')
  ) {
    return 'active';
  }
  return null;
}

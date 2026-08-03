import type { FeatureAccessResult } from '@/lib/core/features/policy';

export type StartAuthorizationInput = {
  authenticated: boolean;
  bookingExists: boolean;
  actorUserId: number;
  clientUserId?: number;
  coachUserId?: number;
  bookingStatus?: string;
  roomMatchesBooking: boolean;
  videoConfigured: boolean;
  withinCallWindow: boolean;
  featureAccess: FeatureAccessResult;
  hasOpenSession: boolean;
};

export type StartAuthorizationResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'not_found'
        | 'unauthenticated'
        | 'not_participant'
        | 'coach_only'
        | 'booking_not_accepted'
        | 'invalid_room'
        | 'video_not_configured'
        | 'outside_call_window'
        | 'not_entitled'
        | 'already_active';
    };

/**
 * Pure, ordered authorization policy. The DB-backed start operation uses this
 * exact result, so unit tests cover the same decision path as the API.
 */
export function authorizeAiNotesStart(
  input: StartAuthorizationInput
): StartAuthorizationResult {
  if (!input.authenticated) {
    return { allowed: false, reason: 'unauthenticated' };
  }
  if (!input.bookingExists) return { allowed: false, reason: 'not_found' };
  const participant =
    input.actorUserId === input.clientUserId ||
    input.actorUserId === input.coachUserId;
  if (!participant) return { allowed: false, reason: 'not_participant' };
  if (input.actorUserId !== input.coachUserId) {
    return { allowed: false, reason: 'coach_only' };
  }
  if (input.bookingStatus !== 'accepted') {
    return { allowed: false, reason: 'booking_not_accepted' };
  }
  if (!input.roomMatchesBooking) {
    return { allowed: false, reason: 'invalid_room' };
  }
  if (!input.videoConfigured) {
    return { allowed: false, reason: 'video_not_configured' };
  }
  if (!input.withinCallWindow) {
    return { allowed: false, reason: 'outside_call_window' };
  }
  if (!input.featureAccess.allowed) {
    return { allowed: false, reason: 'not_entitled' };
  }
  if (input.hasOpenSession) {
    return { allowed: false, reason: 'already_active' };
  }
  return { allowed: true };
}

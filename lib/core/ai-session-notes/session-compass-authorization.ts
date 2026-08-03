/**
 * Politica di accesso a Session Compass: puro, ordinato e testabile.
 *
 * Il report è riservato al coach della sessione e all'amministrazione.
 * L'atleta non deve poterlo leggere: qui viene negato esplicitamente, e la
 * tabella resta comunque irraggiungibile via RLS dai ruoli client.
 */

export type SessionCompassAction = 'read' | 'write' | 'approve' | 'regenerate';

export type SessionCompassAuthorizationInput = {
  authenticated: boolean;
  sessionExists: boolean;
  actorUserId: number;
  coachUserId?: number;
  athleteUserId?: number;
  isAdmin: boolean;
  featureEnabled: boolean;
  action: SessionCompassAction;
};

export type SessionCompassAuthorizationResult =
  | { allowed: true; actorKind: 'coach' | 'admin' }
  | {
      allowed: false;
      reason:
        | 'unauthenticated'
        | 'not_found'
        | 'athlete_forbidden'
        | 'not_authorized'
        | 'feature_not_enabled';
    };

export function authorizeSessionCompass(
  input: SessionCompassAuthorizationInput
): SessionCompassAuthorizationResult {
  if (!input.authenticated) return { allowed: false, reason: 'unauthenticated' };
  if (!input.sessionExists) return { allowed: false, reason: 'not_found' };
  if (input.isAdmin) return { allowed: true, actorKind: 'admin' };
  if (input.actorUserId === input.athleteUserId) {
    return { allowed: false, reason: 'athlete_forbidden' };
  }
  if (input.actorUserId !== input.coachUserId) {
    return { allowed: false, reason: 'not_authorized' };
  }
  if (!input.featureEnabled) return { allowed: false, reason: 'feature_not_enabled' };
  return { allowed: true, actorKind: 'coach' };
}

/** Solo il coach titolare scrive la nota privata; l'admin può leggere. */
export function canEditCoachNote(
  result: SessionCompassAuthorizationResult
): boolean {
  return result.allowed && result.actorKind === 'coach';
}

import 'server-only';
import { createSessionCommitmentStore } from './session-commitments-store';
import {
  listAthleteCommitments,
  recordAthleteCommitmentOutcome,
  type AthleteCommitmentView,
} from './session-commitments';

/**
 * Composizione server per "I tuoi prossimi passi".
 *
 * Restituisce solo la proiezione atleta: nessun estratto di trascrizione e
 * nessun altro contenuto del Session Compass raggiunge questo confine.
 */
export function getAthleteNextSteps(
  athleteUserId: number
): Promise<AthleteCommitmentView[]> {
  return listAthleteCommitments({
    athleteUserId,
    store: createSessionCommitmentStore(),
  });
}

export function submitAthleteCommitmentOutcome(params: {
  commitmentId: number;
  actorUserId: number;
  status: 'completed' | 'skipped';
  note?: string;
}): Promise<unknown> {
  return recordAthleteCommitmentOutcome({
    ...params,
    store: createSessionCommitmentStore(),
    now: () => new Date(),
  });
}

export type { AthleteCommitmentView };

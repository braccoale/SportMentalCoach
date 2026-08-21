import 'server-only';
import { getApiUser } from '@/lib/auth/api-user';
import { updateTrackedCommitmentAsCoach } from '@/lib/core/ai-session-notes/session-compass';
import { sessionCompassDependencies } from '@/lib/core/ai-session-notes/session-compass-runtime';
import {
  SessionCommitmentError,
  TRACKED_COMMITMENT_STATUSES,
  type CommitmentOwner,
  type TrackedCommitmentStatus,
} from '@/lib/core/ai-session-notes/session-commitments';
import {
  authenticatedCompassRequest,
  compassErrorResponse,
} from '../request';

export const dynamic = 'force-dynamic';

/**
 * Aggiorna un impegno già operativo: testo, owner, scadenza o stato.
 *
 * Vale per il browser e per l'app: `getApiUser` legge il Bearer quando c'è e i
 * cookie altrimenti. Segnare «fatto» è la stessa decisione da qualunque parte
 * arrivi, e una regola si scrive una volta sola.
 */
export async function PATCH(
  httpRequest: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const request = await authenticatedCompassRequest(
    () => getApiUser(httpRequest),
    params
  );
  if (request instanceof Response) return request;

  let body: unknown;
  try {
    body = await httpRequest.json();
  } catch {
    return Response.json({ code: 'INVALID_BODY', error: 'Richiesta non valida.' }, { status: 400 });
  }
  const payload = asRecord(body);
  const commitmentId = Number(payload?.commitmentId);
  if (!payload || !Number.isInteger(commitmentId) || commitmentId <= 0) {
    return Response.json({ code: 'INVALID_BODY', error: 'Impegno non valido.' }, { status: 400 });
  }

  try {
    const report = await updateTrackedCommitmentAsCoach(
      {
        ...request,
        commitmentId,
        ...(typeof payload.title === 'string' ? { title: payload.title } : {}),
        ...(isOwner(payload.owner) ? { owner: payload.owner } : {}),
        ...(isStatus(payload.status) ? { status: payload.status } : {}),
        ...(payload.dueDate === null || typeof payload.dueDate === 'string'
          ? { dueDate: payload.dueDate }
          : {}),
      },
      sessionCompassDependencies()
    );
    return Response.json({ report });
  } catch (error) {
    if (error instanceof SessionCommitmentError) {
      return Response.json(
        { code: error.code, error: error.message },
        { status: error.code === 'COMMITMENT_NOT_FOUND' ? 404 : 409 }
      );
    }
    return compassErrorResponse(error);
  }
}

function isOwner(value: unknown): value is CommitmentOwner {
  return value === 'coach' || value === 'athlete';
}

function isStatus(value: unknown): value is TrackedCommitmentStatus {
  return (
    typeof value === 'string' &&
    (TRACKED_COMMITMENT_STATUSES as readonly string[]).includes(value)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

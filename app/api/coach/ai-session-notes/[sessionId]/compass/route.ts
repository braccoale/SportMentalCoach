import 'server-only';
import { getUser } from '@/lib/db/queries';
import {
  getSessionCompass,
  saveCoachNote,
  updateCommitment,
} from '@/lib/core/ai-session-notes/session-compass';
import { sessionCompassDependencies } from '@/lib/core/ai-session-notes/session-compass-runtime';
import {
  COMMITMENT_STATUSES,
  type CommitmentStatus,
  type CompassSpeaker,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { listCoachBookmarks } from '@/lib/core/ai-session-notes/coach-bookmarks-store';
import { loadClosingNote } from '@/lib/core/ai-session-notes/session-close';
import { listCoachVoiceNotes } from '@/lib/core/ai-session-notes/voice-notes';
import {
  authenticatedCompassRequest,
  compassErrorResponse,
} from './request';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const request = await authenticatedCompassRequest(getUser, params);
  if (request instanceof Response) return request;
  try {
    const report = await getSessionCompass(request, sessionCompassDependencies());
    // Segnalibri e nota di chiusura viaggiano accanto al report e non dentro:
    // non sono prodotti dall'AI e non partecipano al suo fingerprint.
    const [bookmarks, closingNote, voiceNotes] = await Promise.all([
      listCoachBookmarks(request.sessionId, request.actorUserId),
      loadClosingNote(request.sessionId),
      listCoachVoiceNotes(request.sessionId, request.actorUserId),
    ]);
    return Response.json({ report, bookmarks, closingNote, voiceNotes });
  } catch (error) {
    return compassErrorResponse(error);
  }
}

/** Aggiorna la nota del coach oppure un singolo impegno del report. */
export async function PATCH(
  httpRequest: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const request = await authenticatedCompassRequest(getUser, params);
  if (request instanceof Response) return request;

  let body: unknown;
  try {
    body = await httpRequest.json();
  } catch {
    return Response.json({ code: 'INVALID_BODY', error: 'Richiesta non valida.' }, { status: 400 });
  }
  const payload = asRecord(body);
  if (!payload) {
    return Response.json({ code: 'INVALID_BODY', error: 'Richiesta non valida.' }, { status: 400 });
  }

  try {
    if (typeof payload.coachNote === 'string') {
      const report = await saveCoachNote(
        { ...request, coachNote: payload.coachNote },
        sessionCompassDependencies()
      );
      return Response.json({ report });
    }
    const commitment = asRecord(payload.commitment);
    if (commitment && typeof commitment.id === 'string') {
      const report = await updateCommitment(
        {
          ...request,
          commitmentId: commitment.id,
          ...(typeof commitment.text === 'string' ? { text: commitment.text } : {}),
          ...(isSpeaker(commitment.owner) ? { owner: commitment.owner } : {}),
          ...(isCommitmentStatus(commitment.status) ? { status: commitment.status } : {}),
        },
        sessionCompassDependencies()
      );
      return Response.json({ report });
    }
    return Response.json({ code: 'INVALID_BODY', error: 'Nessuna modifica riconosciuta.' }, { status: 400 });
  } catch (error) {
    return compassErrorResponse(error);
  }
}

function isSpeaker(value: unknown): value is CompassSpeaker {
  return value === 'coach' || value === 'athlete';
}

function isCommitmentStatus(value: unknown): value is CommitmentStatus {
  return (
    typeof value === 'string' &&
    (COMMITMENT_STATUSES as readonly string[]).includes(value)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

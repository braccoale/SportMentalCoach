import 'server-only';
import { createHash } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  sessionAudioRecordings,
  sessionTranscriptSegments,
  sessionTranscriptTimelineSegments,
} from '@/lib/db/schema';
import { buildTimeline, timelineRowsFingerprint } from './timeline';

/**
 * Le due funzioni della timeline che parlano con il database.
 *
 * Separate dalla regola perché quella deve poter essere verificata senza una
 * connessione: vedi il commento in testa a `timeline.ts`.
 */

/** Fingerprint della timeline salvata; `null` se non ce n'è ancora una. */
export async function persistedTimelineFingerprint(
  sessionId: number
): Promise<string | null> {
  const rows = await db
    .select({
      startMs: sessionTranscriptTimelineSegments.startMs,
      endMs: sessionTranscriptTimelineSegments.endMs,
      participantRole: sessionTranscriptTimelineSegments.participantRole,
      normalizedText: sessionTranscriptTimelineSegments.normalizedText,
    })
    .from(sessionTranscriptTimelineSegments)
    .where(eq(sessionTranscriptTimelineSegments.sessionAiNotesId, sessionId));
  return rows.length ? timelineRowsFingerprint(rows) : null;
}

/** Rebuilds the derived private projection; source segments are never changed. */
export async function rebuildSessionTimeline(sessionId: number, actorUserId: number) {
  const rows = await db.select({ id: sessionTranscriptSegments.id, participantRecordingId: sessionTranscriptSegments.participantRecordingId, participantUserId: sessionTranscriptSegments.participantUserId, participantRole: sessionTranscriptSegments.speakerRole, participantSequence: sessionTranscriptSegments.sequenceNumber, localStart: sessionTranscriptSegments.startedAtMs, localEnd: sessionTranscriptSegments.endedAtMs, text: sessionTranscriptSegments.text, provider: sessionTranscriptSegments.provider, model: sessionTranscriptSegments.providerModel, physicalId: sessionTranscriptSegments.physicalRecordingId, physicalStartedAt: sessionAudioRecordings.startedAt }).from(sessionTranscriptSegments).innerJoin(sessionAudioRecordings, eq(sessionAudioRecordings.id, sessionTranscriptSegments.physicalRecordingId)).where(eq(sessionTranscriptSegments.sessionAiNotesId, sessionId)).orderBy(asc(sessionAudioRecordings.segmentOrder), asc(sessionTranscriptSegments.sequenceNumber));
  if (rows.some(r => !r.participantRecordingId || !r.physicalStartedAt || r.participantRole !== 'coach' && r.participantRole !== 'athlete')) throw new Error('TIMELINE_OFFSETS_UNAVAILABLE');
  const base = Math.min(...rows.map(r => r.physicalStartedAt!.getTime()));
  const timeline = buildTimeline(rows.map(r => ({ id:r.id, participantRecordingId:r.participantRecordingId!, participantUserId:r.participantUserId, participantRole:r.participantRole as 'coach'|'athlete', participantSequence:r.participantSequence, startMs:r.physicalStartedAt!.getTime()-base+r.localStart, endMs:r.physicalStartedAt!.getTime()-base+r.localEnd, text:r.text, provider:r.provider, model:r.model })));
  await db.transaction(async tx => { await tx.delete(sessionTranscriptTimelineSegments).where(eq(sessionTranscriptTimelineSegments.sessionAiNotesId,sessionId)); if(timeline.segments.length) await tx.insert(sessionTranscriptTimelineSegments).values(timeline.segments.map(s => ({sessionAiNotesId:sessionId,participantRecordingId:s.participantRecordingId,participantUserId:s.participantUserId,participantRole:s.participantRole,sourceTranscriptSegmentId:s.id,globalSequence:s.globalSequence,participantSequence:s.participantSequence,startMs:s.startMs,endMs:s.endMs,normalizedText:s.normalizedText,normalizationFlags:s.flags,sourceProvider:s.provider,sourceModel:s.model,createdBy:actorUserId,updatedBy:actorUserId}))); });
  return timeline;
}

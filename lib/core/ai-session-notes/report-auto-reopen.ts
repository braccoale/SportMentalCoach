import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { advanceAiNotesSessionStatus } from './session-status';
import {
  enqueueNormalizationIfReady,
  requeueFailedReportJob,
} from './processing';
import { logPipeline } from './pipeline-log';
import { decideAutomaticReopen } from './report-retry-policy';
import type { AiSessionNotesDependencies } from './dependencies';

type Candidate = {
  id: number;
  requested_by: number;
  segments: number;
  automatic_reopens: number;
  failed_at: string | null;
};

/**
 * Riapre da sola le sedute il cui riepilogo non è mai arrivato.
 *
 * È la stessa operazione di `npm run ai-notes:reopen` — `report_failed →
 * processing`, l'unica transizione all'indietro che la macchina a stati
 * ammette — resa automatica e limitata. Le regole stanno in
 * `report-retry-policy.ts`; qui si legge lo stato, si applica la decisione e
 * si lascia traccia con `automatic: true`, che distingue questa riapertura da
 * quella di una persona.
 *
 * Isolata per seduta: una riapertura che fallisce non ferma le altre né la
 * coda. Non genera niente: rimette in coda il lavoro, e lo esegue il worker
 * che lo prenderà.
 */
export async function reopenFailedReportsAutomatically(
  params: { limit: number; now?: Date },
  dependencies: AiSessionNotesDependencies
): Promise<{ reopened: number; skipped: number; failed: number }> {
  const now = params.now ?? dependencies.clock.now();
  const result = { reopened: 0, skipped: 0, failed: 0 };

  const rows = (await db.execute(sql`
    SELECT s.id,
           s.requested_by,
           (SELECT count(*)::int FROM session_transcript_segments t
             WHERE t.session_ai_notes_id = s.id) AS segments,
           (SELECT count(*)::int FROM session_ai_audit_events e
             WHERE e.session_ai_notes_id = s.id
               AND e.event_metadata->>'reopened' = 'true'
               AND e.event_metadata->>'automatic' = 'true') AS automatic_reopens,
           (SELECT max(e.createddate) FROM session_ai_audit_events e
             WHERE e.session_ai_notes_id = s.id
               AND e.new_status = 'report_failed') AS failed_at
    FROM session_ai_notes s
    WHERE s.status = 'report_failed'
    ORDER BY s.id
    LIMIT ${Math.max(1, Math.min(params.limit, 50))}
  `)) as unknown as Candidate[];

  for (const row of rows) {
    const decision = decideAutomaticReopen({
      status: 'report_failed',
      segmentCount: row.segments,
      automaticReopenCount: row.automatic_reopens,
      failedAt: row.failed_at ? new Date(row.failed_at) : null,
      now,
    });
    if (!decision.reopen) {
      result.skipped += 1;
      continue;
    }
    try {
      const reopened = await advanceAiNotesSessionStatus({
        sessionId: row.id,
        nextStatus: 'processing',
        actorUserId: row.requested_by,
        auditMetadata: {
          automatic: true,
          reopened: true,
          reason:
            'riapertura automatica: trascrizione presente, riepilogo mai generato',
          attempt: row.automatic_reopens + 1,
        },
      });
      if (!reopened) {
        result.skipped += 1;
        continue;
      }
      // Come lo script manuale: se la normalizzazione non è fatta la si
      // accoda, altrimenti si risveglia il riepilogo già esistente.
      const queued = await enqueueNormalizationIfReady(row.id, dependencies);
      if (!queued) {
        await requeueFailedReportJob({
          sessionId: row.id,
          actorUserId: row.requested_by,
        });
      }
      result.reopened += 1;
      logPipeline({
        phase: 'report_generation',
        outcome: 'ok',
        sessionId: row.id,
        counts: { riaperturaAutomatica: row.automatic_reopens + 1 },
      });
    } catch (error) {
      result.failed += 1;
      logPipeline({
        phase: 'report_generation',
        outcome: 'failed',
        sessionId: row.id,
        errorCode: 'AUTO_REOPEN_FAILED',
        detail: {
          message: error instanceof Error ? error.message.slice(0, 200) : null,
        },
      });
    }
  }
  return result;
}

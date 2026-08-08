import 'server-only';
import { EgressClient, EgressStatus } from 'livekit-server-sdk';
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  notExists,
  notInArray,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  livekitWebhookReceipts,
  sessionAiAuditEvents,
  sessionAiNotes,
  sessionAiProcessingJobs,
  sessionAudioRecordings,
} from '@/lib/db/schema';
import {
  deleteAudioObjectAndVerify,
  inspectAudioObject,
  listAudioObjectKeys,
} from './audio-storage';
import { getAudioRecordingConfig } from './recording-config';
import { stopAiNotesRecordings } from './recording';
import { closeAiNotesSession } from './session-close';
import { isSessionPastSafetyLimit } from './session-close-policy';
import type { LiveKitSessionControl } from './livekit-session-control';

/**
 * Chiude le sessioni rimaste aperte oltre il limite di sicurezza.
 *
 * La chiusura esplicita del coach è il criterio primario; questo esiste
 * perché un browser che si chiude o una distrazione non lascino una
 * registrazione viva per giorni, a consumare audio e trascrizione che
 * nessuno ha chiesto.
 *
 * Il motivo `closed_by_timeout` resta registrato e viene mostrato al coach:
 * una chiusura d'ufficio non deve mai sembrare una chiusura normale.
 */
export async function closeExpiredAiNotesSessions(
  liveKit: LiveKitSessionControl,
  params?: { now?: Date; limit?: number }
): Promise<number> {
  const now = params?.now ?? new Date();
  const limit = Math.max(1, Math.min(params?.limit ?? 20, 100));
  const { safetyTimeoutMinutes } = getAudioRecordingConfig();

  const candidates = await db
    .select({
      id: sessionAiNotes.id,
      startedAt: sessionAiNotes.startedAt,
      createdDate: sessionAiNotes.createdDate,
    })
    .from(sessionAiNotes)
    .where(inArray(sessionAiNotes.status, ['active', 'waiting_for_consent']))
    .orderBy(asc(sessionAiNotes.id))
    .limit(limit);

  let closed = 0;
  for (const candidate of candidates) {
    if (
      !isSessionPastSafetyLimit({
        startedAt: candidate.startedAt,
        createdDate: candidate.createdDate,
        now,
        safetyTimeoutMinutes,
      })
    ) {
      continue;
    }
    const didClose = await closeAiNotesSession(
      { sessionId: candidate.id, reason: 'closed_by_timeout' },
      liveKit
    );
    if (didClose) closed += 1;
  }
  return closed;
}

export type RetentionResult = {
  dryRun: boolean;
  candidates: number;
  deleted: number;
  failed: number;
  recordingIds: number[];
};

async function maintenanceAudit(params: {
  sessionId: number;
  requestedBy: number;
  eventType:
    | 'recording_deletion_requested'
    | 'recording_deleted'
    | 'recording_deletion_failed'
    | 'recording_reconciled';
  recordingId: number;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(sessionAiAuditEvents).values({
    sessionAiNotesId: params.sessionId,
    eventType: params.eventType,
    actorUserId: params.requestedBy,
    eventMetadata: {
      recordingId: params.recordingId,
      ...(params.metadata ?? {}),
    },
    createdBy: params.requestedBy,
    updatedBy: params.requestedBy,
  });
}

/**
 * Dry-run by default. Production schedulers must pass apply:true explicitly.
 * Missing objects are considered successfully deleted only after a fresh list
 * confirms absence.
 */
export async function runAudioRetention(params?: {
  apply?: boolean;
  now?: Date;
  limit?: number;
}): Promise<RetentionResult> {
  const apply = params?.apply === true;
  const now = params?.now ?? new Date();
  const limit = Math.max(1, Math.min(params?.limit ?? 100, 500));
  const rows = await db
    .select({
      id: sessionAudioRecordings.id,
      sessionId: sessionAudioRecordings.sessionAiNotesId,
      requestedBy: sessionAiNotes.requestedBy,
      objectKey: sessionAudioRecordings.storageObjectKey,
    })
    .from(sessionAudioRecordings)
    .innerJoin(
      sessionAiNotes,
      eq(sessionAiNotes.id, sessionAudioRecordings.sessionAiNotesId)
    )
    .where(
      and(
        lte(sessionAudioRecordings.retentionUntil, now),
        isNull(sessionAudioRecordings.deletedAt),
        notInArray(sessionAudioRecordings.status, [
          'pending',
          'starting',
          'recording',
          'stopping',
          'deleted',
        ]),
        notExists(
          db
            .select({ id: sessionAiProcessingJobs.id })
            .from(sessionAiProcessingJobs)
            .where(
              and(
                eq(
                  sessionAiProcessingJobs.participantRecordingId,
                  sessionAudioRecordings.participantRecordingId
                ),
                eq(sessionAiProcessingJobs.jobType, 'transcription'),
                inArray(sessionAiProcessingJobs.status, ['queued', 'processing'])
              )
            )
        )
      )
    )
    .orderBy(asc(sessionAudioRecordings.retentionUntil))
    .limit(limit);
  const result: RetentionResult = {
    dryRun: !apply,
    candidates: rows.length,
    deleted: 0,
    failed: 0,
    recordingIds: rows.map((row) => row.id),
  };
  if (!apply || rows.length === 0) return result;

  const config = getAudioRecordingConfig();
  for (const row of rows) {
    const [claimed] = await db
      .update(sessionAudioRecordings)
      .set({
        status: 'deletion_pending',
        deletionAttempts: sql`${sessionAudioRecordings.deletionAttempts} + 1`,
        updatedDate: now,
        updatedBy: row.requestedBy,
      })
      .where(
        and(
          eq(sessionAudioRecordings.id, row.id),
          isNull(sessionAudioRecordings.deletedAt),
          inArray(sessionAudioRecordings.status, [
            'recorded',
            'failed',
            'deletion_failed',
          ])
        )
      )
      .returning({ id: sessionAudioRecordings.id });
    if (!claimed) continue;
    await maintenanceAudit({
      sessionId: row.sessionId,
      requestedBy: row.requestedBy,
      eventType: 'recording_deletion_requested',
      recordingId: row.id,
    });
    try {
      await deleteAudioObjectAndVerify(config, row.objectKey);
      await db
        .update(sessionAudioRecordings)
        .set({
          status: 'deleted',
          deletedAt: new Date(),
          errorCode: null,
          errorMessageSanitized: null,
          updatedDate: new Date(),
          updatedBy: row.requestedBy,
        })
        .where(eq(sessionAudioRecordings.id, row.id));
      await maintenanceAudit({
        sessionId: row.sessionId,
        requestedBy: row.requestedBy,
        eventType: 'recording_deleted',
        recordingId: row.id,
      });
      result.deleted += 1;
    } catch {
      await db
        .update(sessionAudioRecordings)
        .set({
          status: 'deletion_failed',
          errorCode: 'STORAGE_DELETE_FAILED',
          errorMessageSanitized: 'Eliminazione storage non verificata.',
          updatedDate: new Date(),
          updatedBy: row.requestedBy,
        })
        .where(eq(sessionAudioRecordings.id, row.id));
      await maintenanceAudit({
        sessionId: row.sessionId,
        requestedBy: row.requestedBy,
        eventType: 'recording_deletion_failed',
        recordingId: row.id,
        metadata: { errorCode: 'STORAGE_DELETE_FAILED' },
      });
      result.failed += 1;
    }
  }
  return result;
}

export type ReconciliationIssue = {
  code:
    | 'LIVE_EGRESS_WITHOUT_DB'
    | 'DB_ACTIVE_WITHOUT_EGRESS_ID'
    | 'DB_ACTIVE_WITHOUT_LIVE_EGRESS'
    | 'TERMINAL_EGRESS_WITH_TRANSITIONAL_DB'
    | 'RECORDED_WITHOUT_FILE'
    | 'STORAGE_ORPHAN'
    | 'STALE_TRANSITION'
    | 'DELETION_INCOMPLETE'
    | 'DUPLICATE_LIVE_EGRESS'
    | 'STALE_WEBHOOK_RECEIPT'
    | 'FAILED_WEBHOOK_RECEIPT';
  recordingId?: number;
  egressId?: string;
  eventId?: string;
  objectKey?: string;
};

export async function reconcileAudioRecordings(
  liveKit: LiveKitSessionControl,
  params?: {
    repair?: boolean;
    now?: Date;
  }
): Promise<{
  dryRun: boolean;
  issues: ReconciliationIssue[];
  storageScanTruncated: boolean;
}> {
  const repair = params?.repair === true;
  const now = params?.now ?? new Date();
  const config = getAudioRecordingConfig();
  const egressClient = new EgressClient(
    config.livekitHost,
    config.livekitApiKey,
    config.livekitApiSecret
  );
  const [egresses, rows, storage, webhookReceipts] = await Promise.all([
    egressClient.listEgress(),
    db
      .select({
        id: sessionAudioRecordings.id,
        sessionId: sessionAudioRecordings.sessionAiNotesId,
        requestedBy: sessionAiNotes.requestedBy,
        egressId: sessionAudioRecordings.livekitEgressId,
        status: sessionAudioRecordings.status,
        objectKey: sessionAudioRecordings.storageObjectKey,
        updatedDate: sessionAudioRecordings.updatedDate,
        deletedAt: sessionAudioRecordings.deletedAt,
      })
      .from(sessionAudioRecordings)
      .innerJoin(
        sessionAiNotes,
        eq(sessionAiNotes.id, sessionAudioRecordings.sessionAiNotesId)
      ),
    listAudioObjectKeys(config),
    db
      .select({
        eventId: livekitWebhookReceipts.eventId,
        status: livekitWebhookReceipts.status,
        updatedDate: livekitWebhookReceipts.updatedDate,
      })
      .from(livekitWebhookReceipts)
      .where(
        inArray(livekitWebhookReceipts.status, ['processing', 'failed'])
      ),
  ]);
  const issues: ReconciliationIssue[] = [];
  const byEgress = new Map(
    rows
      .filter((row) => row.egressId)
      .map((row) => [row.egressId!, row])
  );
  const liveById = new Map(egresses.map((egress) => [egress.egressId, egress]));
  const liveByRecording = new Map<number, number>();
  const liveStatuses = new Set([
    EgressStatus.EGRESS_STARTING,
    EgressStatus.EGRESS_ACTIVE,
    EgressStatus.EGRESS_ENDING,
  ]);
  for (const egress of egresses) {
    const row = byEgress.get(egress.egressId);
    if (!row && liveStatuses.has(egress.status)) {
      issues.push({
        code: 'LIVE_EGRESS_WITHOUT_DB',
        egressId: egress.egressId,
      });
    }
    if (row && liveStatuses.has(egress.status)) {
      const count = (liveByRecording.get(row.id) ?? 0) + 1;
      liveByRecording.set(row.id, count);
      if (count > 1) {
        issues.push({
          code: 'DUPLICATE_LIVE_EGRESS',
          recordingId: row.id,
        });
      }
    }
  }

  const storageSet = new Set(storage.keys);
  const knownKeys = new Set(rows.map((row) => row.objectKey));
  const staleBefore = new Date(
    now.getTime() - config.safetyTimeoutMinutes * 60_000
  );
  for (const receipt of webhookReceipts) {
    if (receipt.status === 'failed') {
      issues.push({
        code: 'FAILED_WEBHOOK_RECEIPT',
        eventId: receipt.eventId,
      });
    } else if (receipt.updatedDate < new Date(now.getTime() - 5 * 60_000)) {
      issues.push({
        code: 'STALE_WEBHOOK_RECEIPT',
        eventId: receipt.eventId,
      });
    }
  }
  for (const row of rows) {
    const transitional = ['pending', 'starting', 'recording', 'stopping'].includes(
      row.status
    );
    if (transitional && !row.egressId) {
      issues.push({
        code: 'DB_ACTIVE_WITHOUT_EGRESS_ID',
        recordingId: row.id,
      });
    } else if (
      transitional &&
      row.egressId &&
      !liveById.has(row.egressId)
    ) {
      issues.push({
        code: 'DB_ACTIVE_WITHOUT_LIVE_EGRESS',
        recordingId: row.id,
        egressId: row.egressId,
      });
    } else if (
      transitional &&
      row.egressId &&
      !liveStatuses.has(liveById.get(row.egressId)!.status)
    ) {
      issues.push({
        code: 'TERMINAL_EGRESS_WITH_TRANSITIONAL_DB',
        recordingId: row.id,
        egressId: row.egressId,
      });
    }
    if (row.status === 'recorded' && !storageSet.has(row.objectKey)) {
      const verified = await inspectAudioObject(config, row.objectKey);
      if (!verified.exists) {
        issues.push({
          code: 'RECORDED_WITHOUT_FILE',
          recordingId: row.id,
        });
      }
    }
    if (transitional && row.updatedDate < staleBefore) {
      issues.push({ code: 'STALE_TRANSITION', recordingId: row.id });
      if (repair) {
        await stopAiNotesRecordings({
          sessionId: row.sessionId,
          actorUserId: row.requestedBy,
          reason: 'safety_timeout',
        }, liveKit);
      }
    }
    if (row.status === 'deletion_pending' || row.status === 'deletion_failed') {
      issues.push({
        code: 'DELETION_INCOMPLETE',
        recordingId: row.id,
      });
    }
    if (repair) {
      await db
        .update(sessionAudioRecordings)
        .set({ lastReconciledAt: now, updatedDate: now })
        .where(eq(sessionAudioRecordings.id, row.id));
      await maintenanceAudit({
        sessionId: row.sessionId,
        requestedBy: row.requestedBy,
        eventType: 'recording_reconciled',
        recordingId: row.id,
      });
    }
  }
  for (const key of storage.keys) {
    if (!knownKeys.has(key)) {
      issues.push({ code: 'STORAGE_ORPHAN', objectKey: key });
    }
  }
  return {
    dryRun: !repair,
    issues,
    storageScanTruncated: storage.truncated,
  };
}

/**
 * Store impegni in memoria per i test focalizzati.
 *
 * Riproduce i soli comportamenti su cui il dominio fa affidamento: unicità di
 * `(sessionId, commitmentKey)`, aggiornamenti parziali e registro audit.
 * Nessun database, nessuna rete.
 */

import type {
  AthleteCommitmentSource,
  CommitmentAuditEvent,
  CommitmentSyncPlan,
  SessionCommitmentStore,
  TrackedCommitment,
  TrackedCommitmentChanges,
} from './session-commitments';

export type InMemoryCommitmentContext = {
  coachName?: string;
  bookingId?: number;
  sessionDate?: Date | null;
};

/**
 * Rispecchia `session_ai_commitments_completed_check`. Senza questo controllo
 * lo store in memoria accetterebbe stati che il database rifiuta, e i test
 * darebbero per buona una scrittura impossibile in produzione.
 */
function assertCompletedInvariant(row: TrackedCommitment): void {
  if ((row.status === 'completed') !== (row.completedAt !== null)) {
    throw new Error(
      `session_ai_commitments_completed_check: status=${row.status} completedAt=${row.completedAt}`
    );
  }
}

export class InMemorySessionCommitmentStore implements SessionCommitmentStore {
  readonly rows: TrackedCommitment[] = [];
  readonly audits: Array<{ eventType: CommitmentAuditEvent; metadata: Record<string, unknown> }> = [];
  private nextId = 1;

  constructor(private readonly context: InMemoryCommitmentContext = {}) {}

  async listBySession(sessionId: number): Promise<TrackedCommitment[]> {
    return this.rows
      .filter((row) => row.sessionId === sessionId)
      .map((row) => ({ ...row }));
  }

  async listForAthlete(athleteUserId: number): Promise<AthleteCommitmentSource[]> {
    return this.rows
      .filter((row) => row.athleteUserId === athleteUserId && row.owner === 'athlete')
      .map((row) => ({
        ...row,
        coachName: this.context.coachName ?? 'Coach',
        bookingId: this.context.bookingId ?? row.sessionId,
        sessionDate: this.context.sessionDate ?? null,
      }));
  }

  async loadById(commitmentId: number): Promise<TrackedCommitment | null> {
    const row = this.rows.find((item) => item.id === commitmentId);
    return row ? { ...row } : null;
  }

  async applySync(plan: CommitmentSyncPlan, actorUserId: number): Promise<void> {
    for (const insert of plan.inserts) {
      const duplicate = this.rows.some(
        (row) =>
          row.sessionId === insert.sessionId && row.commitmentKey === insert.commitmentKey
      );
      if (duplicate) continue;
      this.rows.push({
        id: this.nextId++,
        sessionId: insert.sessionId,
        sourceReportId: insert.sourceReportId,
        sourceReportVersion: insert.sourceReportVersion,
        athleteUserId: insert.athleteUserId,
        coachUserId: insert.coachUserId,
        commitmentKey: insert.commitmentKey,
        title: insert.title,
        owner: insert.owner,
        status: insert.status,
        dueDate: insert.dueDate,
        completedAt: insert.completedAt,
        athleteNote: null,
        sourceTranscriptSegmentId: insert.sourceTranscriptSegmentId,
        sourceTimestampMs: insert.sourceTimestampMs,
        sourceExcerpt: insert.sourceExcerpt,
        manuallyEdited: false,
        archivedAt: null,
      });
      assertCompletedInvariant(this.rows.at(-1)!);
    }
    for (const update of plan.updates) {
      await this.update(update.id, update.changes, actorUserId);
    }
    for (const id of plan.archives) {
      await this.update(id, { archivedAt: new Date('2026-08-10T00:00:00.000Z') }, actorUserId);
    }
  }

  async update(
    commitmentId: number,
    changes: TrackedCommitmentChanges,
    _actorUserId: number
  ): Promise<TrackedCommitment> {
    const row = this.rows.find((item) => item.id === commitmentId);
    if (!row) throw new Error('impegno non trovato');
    for (const [field, value] of Object.entries(changes)) {
      if (value === undefined) continue;
      Object.assign(row, { [field]: value });
    }
    assertCompletedInvariant(row);
    return { ...row };
  }

  async recordAudit(params: {
    eventType: CommitmentAuditEvent;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    this.audits.push({ eventType: params.eventType, metadata: params.metadata });
  }
}

import 'server-only';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminAuditEvents,
  users,
  type AdminAuditAction,
  type AdminAuditOutcome,
  type AdminAuditSubject,
} from '@/lib/db/schema';
import { buildAdminAuditEntry } from './admin-audit-policy';

export * from './admin-audit-policy';

/**
 * Scrive una riga nel registro delle azioni amministrative.
 *
 * **Non solleva mai.** Un'approvazione coach non deve fallire perché il
 * registro era irraggiungibile: il danno di un'azione bloccata è immediato e
 * visibile, quello di una riga di registro mancante è differito e raro. La
 * scelta è deliberata, e il fallimento finisce nei log del server con il suo
 * motivo — non in silenzio.
 *
 * La tabella è append-only anche lato database (trigger in `app_private`,
 * migrazione 0060): non esiste da nessuna parte un percorso di aggiornamento
 * o cancellazione, e non deve essercene uno.
 */
export async function recordAdminAudit(params: {
  actor: { id: number; email: string };
  action: AdminAuditAction;
  subjectType: AdminAuditSubject;
  subjectId?: number | null;
  outcome?: AdminAuditOutcome;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const entry = buildAdminAuditEntry(params);
  try {
    await db.insert(adminAuditEvents).values({
      actorUserId: params.actor.id,
      actorEmail: params.actor.email.slice(0, 255),
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      outcome: entry.outcome,
      detail: entry.detail,
    });
  } catch (error) {
    console.error('[admin-audit] riga non scritta', {
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
  }
}

export type AdminAuditRow = {
  id: number;
  at: Date;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  subjectType: string;
  subjectId: number | null;
  outcome: string;
  detail: Record<string, unknown>;
};

export const AUDIT_PAGE_SIZE = 50;

/**
 * Le ultime azioni amministrative, paginate lato server.
 *
 * `limit`/`offset` e non «tutte»: il registro non si svuota mai, e una
 * pagina che carica tutto è una pagina che smette di aprirsi esattamente nel
 * momento in cui il registro comincia a contenere qualcosa.
 */
export async function getAdminAuditEvents(params: {
  page?: number;
  action?: AdminAuditAction | null;
  since?: Date | null;
} = {}): Promise<{ rows: AdminAuditRow[]; total: number }> {
  const page = Math.max(1, Math.min(params.page ?? 1, 200));
  const filters = [
    params.action ? eq(adminAuditEvents.action, params.action) : undefined,
    params.since ? gte(adminAuditEvents.createdDate, params.since) : undefined,
  ].filter(Boolean);
  const where = filters.length ? and(...filters) : undefined;

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: adminAuditEvents.id,
        at: adminAuditEvents.createdDate,
        actorEmail: adminAuditEvents.actorEmail,
        actorName: sql<string | null>`nullif(trim(concat(coalesce(${users.name}, ''), ' ', coalesce(${users.lastName}, ''))), '')`,
        action: adminAuditEvents.action,
        subjectType: adminAuditEvents.subjectType,
        subjectId: adminAuditEvents.subjectId,
        outcome: adminAuditEvents.outcome,
        detail: adminAuditEvents.detail,
      })
      .from(adminAuditEvents)
      .leftJoin(users, eq(users.id, adminAuditEvents.actorUserId))
      .where(where)
      .orderBy(desc(adminAuditEvents.createdDate), desc(adminAuditEvents.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(adminAuditEvents)
      .where(where),
  ]);

  return { rows, total: totals?.total ?? 0 };
}

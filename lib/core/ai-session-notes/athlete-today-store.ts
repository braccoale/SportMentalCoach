import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  commitmentAttempts,
  profiles,
  providerProfiles,
  sessionAiCommitments,
  sessionAiNotes,
} from '@/lib/db/schema';
import { listPathsForAthlete, type StoredPath } from '@/lib/core/paths/path-store';
import { sessionEndsAt } from '@/lib/core/sessions';
import { listAttemptsByCommitmentIds } from './commitment-attempts-store';
import {
  selectTodayState,
  todayCopy,
  type TodayAction,
  type TodayBooking,
  type TodayRequest,
  type TodayState,
} from './athlete-today';

/**
 * Compone «Oggi» per un atleta.
 *
 * Carica gli ingressi e li passa alla regola pura: quale stato mostrare, quale
 * azione in cima e con che testo lo decide `athlete-today.ts`, che si verifica
 * senza database. Il client riceve l'esito — è il modo in cui web e app hanno
 * smesso di divergere.
 */

export type TodayPayload = {
  state: TodayState['key'];
  title: string;
  body: string;
  action: (TodayAction & { attempts: AttemptSummary[] }) | null;
  otherActions: Array<TodayAction & { attempts: AttemptSummary[] }>;
  openActionCount: number;
  nextBooking: TodayBooking | null;
  canJoinNow: boolean;
  request: TodayRequest | null;
  /** Percorsi attivi: con più di uno, il destinatario va scelto. */
  activePaths: Array<{ pathId: number; coachName: string }>;
  /** Il percorso chiuso più recente, con l'identificativo per riaprirlo se è
   * stata l'atleta a chiuderlo — resta `null` altrimenti. */
  closedPath: { pathId: number; coachName: string; closedByRole: 'coach' | 'athlete' } | null;
};

type AttemptSummary = {
  id: number;
  outcome: string;
  outcomeLabel: string;
  occurredOn: string;
  note: string | null;
  edited: boolean;
  version: number;
};

export async function getAthleteToday(params: {
  athleteUserId: number;
  now: Date;
}): Promise<TodayPayload> {
  const paths = await listPathsForAthlete(params.athleteUserId);
  const activePaths = paths.filter((path) => path.status === 'active');

  const [actions, upcoming] = await Promise.all([
    loadOpenActions({ athleteUserId: params.athleteUserId, paths: activePaths }),
    loadBookings({ athleteUserId: params.athleteUserId, now: params.now }),
  ]);

  const state = selectTodayState({
    activePathCount: activePaths.length,
    knownPathCount: paths.length,
    closedPath: closedPathSummary(paths),
    actions,
    nextBooking: upcoming.next,
    requests: upcoming.requests,
    now: params.now,
  });

  const attemptsByCommitment = await listAttemptsByCommitmentIds(
    actions.map((action) => action.commitmentId)
  );
  const withAttempts = (action: TodayAction) => ({
    ...action,
    attempts: (attemptsByCommitment.get(action.commitmentId) ?? []).map((attempt) => ({
      id: attempt.id,
      outcome: attempt.outcome,
      outcomeLabel: attempt.outcomeLabel,
      occurredOn: attempt.occurredOn,
      note: attempt.note,
      edited: attempt.edited,
      version: attempt.version,
    })),
  });

  const copy = todayCopy(state);
  return {
    state: state.key,
    title: copy.title,
    body: copy.body,
    action: state.action ? withAttempts(state.action) : null,
    otherActions: state.otherActions.map(withAttempts),
    openActionCount: state.openActionCount,
    nextBooking: state.nextBooking,
    canJoinNow: state.canJoinNow,
    request: state.request,
    activePaths: activePaths.map((path) => ({
      pathId: path.id,
      coachName: path.coachName,
    })),
    closedPath: state.closedPath
      ? {
          pathId: state.closedPath.pathId,
          coachName: state.closedPath.coachName,
          closedByRole: state.closedPath.closedByRole,
        }
      : null,
  };
}

/**
 * Le azioni aperte dell'atleta sui percorsi attivi.
 *
 * «Aperte» significa `pending` o `in_progress`, non archiviate. Le azioni in
 * pausa **ci sono**: è la regola pura a non proporle come principali, e
 * escluderle qui le farebbe sparire anche dall'elenco, che è esattamente
 * l'errore che la pausa doveva evitare.
 */
async function loadOpenActions(params: {
  athleteUserId: number;
  paths: readonly StoredPath[];
}): Promise<TodayAction[]> {
  if (params.paths.length === 0) return [];
  const coachIds = params.paths.map((path) => path.coachUserId);
  const pathByCoach = new Map(params.paths.map((path) => [path.coachUserId, path]));

  const rows = await db
    .select({
      commitmentId: sessionAiCommitments.id,
      coachUserId: sessionAiCommitments.coachUserId,
      title: sessionAiCommitments.title,
      dueDate: sessionAiCommitments.dueDate,
      pausedAt: sessionAiCommitments.pausedAt,
      pausedReason: sessionAiCommitments.pausedReason,
      agreedOn: bookings.scheduledFor,
    })
    .from(sessionAiCommitments)
    .innerJoin(
      sessionAiNotes,
      eq(sessionAiNotes.id, sessionAiCommitments.sessionAiNotesId)
    )
    .leftJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .where(
      and(
        eq(sessionAiCommitments.athleteUserId, params.athleteUserId),
        eq(sessionAiCommitments.owner, 'athlete'),
        inArray(sessionAiCommitments.coachUserId, coachIds),
        inArray(sessionAiCommitments.status, ['pending', 'in_progress']),
        isNull(sessionAiCommitments.archivedAt)
      )
    )
    .orderBy(desc(bookings.scheduledFor));

  const counts = await countAttempts(rows.map((row) => row.commitmentId));

  return rows.flatMap((row) => {
    const path = pathByCoach.get(row.coachUserId);
    if (!path) return [];
    const summary = counts.get(row.commitmentId);
    return [
      {
        commitmentId: row.commitmentId,
        pathId: path.id,
        title: row.title,
        coachName: path.coachName,
        dueDate: row.dueDate,
        agreedOn: row.agreedOn,
        pausedAt: row.pausedAt,
        pausedReason: row.pausedReason,
        attemptCount: summary?.count ?? 0,
        lastAttemptOn: summary?.lastOn ?? null,
      },
    ];
  });
}

async function countAttempts(
  commitmentIds: readonly number[]
): Promise<Map<number, { count: number; lastOn: string | null }>> {
  const result = new Map<number, { count: number; lastOn: string | null }>();
  if (commitmentIds.length === 0) return result;

  const rows = await db
    .select({
      commitmentId: commitmentAttempts.commitmentId,
      count: sql<number>`count(*)::int`,
      lastOn: sql<string | null>`max(${commitmentAttempts.occurredOn})::text`,
    })
    .from(commitmentAttempts)
    .where(
      and(
        inArray(commitmentAttempts.commitmentId, [...commitmentIds]),
        isNull(commitmentAttempts.hiddenAt)
      )
    )
    .groupBy(commitmentAttempts.commitmentId);

  for (const row of rows) {
    result.set(row.commitmentId, { count: row.count, lastOn: row.lastOn });
  }
  return result;
}

/**
 * La prossima sessione e le richieste ancora appese.
 *
 * «Prossima» include quella in corso: una sessione cominciata dieci minuti fa è
 * la cosa più rilevante che esista per chi apre l'app, e sparirebbe da un
 * filtro che guardasse solo il futuro. Il confine è la fine della sua durata,
 * calcolata con `sessionEndsAt`, la stessa funzione che chiude la stanza.
 */
async function loadBookings(params: {
  athleteUserId: number;
  now: Date;
}): Promise<{ next: TodayBooking | null; requests: TodayRequest[] }> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      status: bookings.status,
      scheduledFor: bookings.scheduledFor,
      durationMin: bookings.durationMin,
      requestedAt: bookings.requestedAt,
      coachUserId: providerProfiles.userId,
      coachName: sql<string>`coalesce(nullif(btrim(${profiles.displayName}), ''), 'Coach')`,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(
      and(
        eq(bookings.clientId, params.athleteUserId),
        or(eq(bookings.status, 'accepted'), eq(bookings.status, 'requested')),
        // Una finestra generosa all'indietro: il taglio vero lo fa
        // `sessionEndsAt` qui sotto, riga per riga.
        or(
          isNull(bookings.scheduledFor),
          gte(bookings.scheduledFor, new Date(params.now.getTime() - 7 * 86_400_000))
        )
      )
    )
    .orderBy(asc(bookings.scheduledFor));

  const paths = await listPathsForAthlete(params.athleteUserId);
  const pathByCoach = new Map(paths.map((path) => [path.coachUserId, path.id]));

  let next: TodayBooking | null = null;
  const requests: TodayRequest[] = [];

  for (const row of rows) {
    if (row.status === 'requested') {
      requests.push({
        bookingId: row.bookingId,
        coachName: row.coachName,
        requestedAt: row.requestedAt,
        scheduledFor: row.scheduledFor,
        durationMin: row.durationMin,
      });
      continue;
    }
    if (next) continue;
    if (
      row.scheduledFor &&
      sessionEndsAt(row.scheduledFor, row.durationMin).getTime() < params.now.getTime()
    ) {
      continue;
    }
    next = {
      bookingId: row.bookingId,
      pathId: pathByCoach.get(row.coachUserId) ?? null,
      scheduledFor: row.scheduledFor,
      durationMin: row.durationMin,
      coachName: row.coachName,
    };
  }

  return { next, requests };
}

/**
 * Il percorso chiuso più recente: spiega il vuoto e, quando è stata l'atleta a
 * chiuderlo, porta anche l'identificativo che serve per riaprirlo da qui —
 * `authorizePathReopen` resta l'unica a deciderlo, questo è solo il dato.
 */
function closedPathSummary(paths: readonly StoredPath[]) {
  const closed = paths
    .filter((path) => path.status === 'closed' && path.closedAt)
    .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))[0];
  return closed
    ? {
        pathId: closed.id,
        coachName: closed.coachName,
        closedByRole: closed.closedByRole ?? ('athlete' as const),
        closedAt: closed.closedAt as Date,
      }
    : null;
}

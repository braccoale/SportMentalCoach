import 'server-only';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  coachAthletePathEvents,
  coachAthletePaths,
  profiles,
  providerProfiles,
  users,
} from '@/lib/db/schema';
import {
  authorizeContributionRevocation,
  authorizePathClosure,
  authorizePathReopen,
  planPathActivation,
  type PathActorRole,
  type PathState,
} from './path-policy';

/**
 * Lettura e scrittura dei percorsi coach-atleta.
 *
 * Ogni decisione la prende `path-policy.ts`, che è puro e testato senza
 * database; qui si caricano gli ingressi e si applica l'esito. Lo store non
 * decide niente per conto suo — è il modo per cui la regola resta scritta una
 * volta e verificabile senza rete.
 */

export type StoredPath = PathState & {
  coachName: string;
  athleteName: string;
  activatedAt: Date;
  closedAt: Date | null;
};

const COACH_NAME = sql<string>`coalesce(nullif(btrim(${profiles.displayName}), ''), 'Coach')`;
const ATHLETE_NAME = sql<string>`btrim(coalesce(${users.name}, '') || ' ' || coalesce(${users.lastName}, ''))`;

function selection() {
  return {
    id: coachAthletePaths.id,
    coachUserId: coachAthletePaths.coachUserId,
    athleteUserId: coachAthletePaths.athleteUserId,
    status: coachAthletePaths.status,
    closedByRole: coachAthletePaths.closedByRole,
    contributionsRevokedAt: coachAthletePaths.contributionsRevokedAt,
    activatedAt: coachAthletePaths.activatedAt,
    closedAt: coachAthletePaths.closedAt,
    coachName: COACH_NAME,
    athleteName: ATHLETE_NAME,
  };
}

function hydrate(row: {
  id: number;
  coachUserId: number;
  athleteUserId: number;
  status: string;
  closedByRole: string | null;
  contributionsRevokedAt: Date | null;
  activatedAt: Date;
  closedAt: Date | null;
  coachName: string;
  athleteName: string;
}): StoredPath {
  return {
    id: row.id,
    coachUserId: row.coachUserId,
    athleteUserId: row.athleteUserId,
    status: row.status === 'closed' ? 'closed' : 'active',
    closedByRole: (row.closedByRole as PathActorRole | null) ?? null,
    contributionsRevokedAt: row.contributionsRevokedAt,
    activatedAt: row.activatedAt,
    closedAt: row.closedAt,
    coachName: row.coachName,
    athleteName: row.athleteName.trim() || 'Atleta',
  };
}

/** Il percorso fra due persone, se è mai stato aperto. */
export async function findPath(params: {
  coachUserId: number;
  athleteUserId: number;
}): Promise<StoredPath | null> {
  const [row] = await db
    .select(selection())
    .from(coachAthletePaths)
    .leftJoin(profiles, eq(profiles.userId, coachAthletePaths.coachUserId))
    .leftJoin(users, eq(users.id, coachAthletePaths.athleteUserId))
    .where(
      and(
        eq(coachAthletePaths.coachUserId, params.coachUserId),
        eq(coachAthletePaths.athleteUserId, params.athleteUserId)
      )
    )
    .limit(1);
  return row ? hydrate(row) : null;
}

export async function loadPathById(pathId: number): Promise<StoredPath | null> {
  const [row] = await db
    .select(selection())
    .from(coachAthletePaths)
    .leftJoin(profiles, eq(profiles.userId, coachAthletePaths.coachUserId))
    .leftJoin(users, eq(users.id, coachAthletePaths.athleteUserId))
    .where(eq(coachAthletePaths.id, pathId))
    .limit(1);
  return row ? hydrate(row) : null;
}

/** Tutti i percorsi di un atleta, chiusi compresi: servono a spiegare i vuoti. */
export async function listPathsForAthlete(
  athleteUserId: number
): Promise<StoredPath[]> {
  const rows = await db
    .select(selection())
    .from(coachAthletePaths)
    .leftJoin(profiles, eq(profiles.userId, coachAthletePaths.coachUserId))
    .leftJoin(users, eq(users.id, coachAthletePaths.athleteUserId))
    .where(eq(coachAthletePaths.athleteUserId, athleteUserId))
    .orderBy(desc(coachAthletePaths.activatedAt));
  return rows.map(hydrate);
}

export type ActivationOutcome =
  | { kind: 'created'; path: StoredPath }
  | { kind: 'unchanged'; path: StoredPath | null }
  | { kind: 'reopen_proposed'; path: StoredPath; toRole: PathActorRole };

/**
 * Apre il percorso quando una prenotazione raggiunge `accepted`.
 *
 * **Non fallisce mai rumorosamente.** Viene chiamata dentro il percorso di
 * accettazione di una prenotazione, che è la cosa che l'utente ha davvero
 * chiesto: se qui andasse storto qualcosa, il coach non deve vedersi rifiutare
 * l'accettazione. L'errore viene registrato e la prenotazione va avanti — il
 * percorso si apre alla prossima occasione.
 *
 * **Non riapre mai un percorso chiuso**: lo propone. Riaprire perché è comparso
 * un appuntamento rimetterebbe in circolo contributi che qualcuno aveva
 * deliberatamente fermato, senza dirglielo.
 */
export async function ensurePathForAcceptedBooking(params: {
  coachUserId: number;
  athleteUserId: number;
  bookingId: number;
  actorUserId: number;
}): Promise<ActivationOutcome> {
  const existing = await findPath(params);
  const decision = planPathActivation({
    existing,
    bookingStatus: 'accepted',
    coachUserId: params.coachUserId,
    athleteUserId: params.athleteUserId,
  });
  if (!decision.allowed) return { kind: 'unchanged', path: existing };

  if (decision.outcome.kind === 'noop') {
    return { kind: 'unchanged', path: existing };
  }
  if (decision.outcome.kind === 'propose_reopen') {
    return {
      kind: 'reopen_proposed',
      path: existing as StoredPath,
      toRole: decision.outcome.toRole,
    };
  }

  const [created] = await db
    .insert(coachAthletePaths)
    .values({
      coachUserId: params.coachUserId,
      athleteUserId: params.athleteUserId,
      status: 'active',
      activationBookingId: params.bookingId,
      updatedBy: params.actorUserId,
    })
    /*
     * Due accettazioni ravvicinate non devono produrre due percorsi.
     * L'unicità della coppia è già nel database: qui si sceglie di non
     * scrivere invece di trasformare la corsa in un errore visibile al coach.
     */
    .onConflictDoNothing({
      target: [coachAthletePaths.coachUserId, coachAthletePaths.athleteUserId],
    })
    .returning({ id: coachAthletePaths.id });

  if (!created) {
    const path = await findPath(params);
    return { kind: 'unchanged', path };
  }

  await db.insert(coachAthletePathEvents).values({
    pathId: created.id,
    event: 'activated',
    actorRole: 'coach',
    actorId: params.actorUserId,
    bookingId: params.bookingId,
  });

  const path = await loadPathById(created.id);
  return path ? { kind: 'created', path } : { kind: 'unchanged', path: null };
}

/** C'è una sessione futura ancora in piedi fra queste due persone? */
export async function hasFutureAcceptedBooking(params: {
  coachUserId: number;
  athleteUserId: number;
  now: Date;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .where(
      and(
        eq(bookings.clientId, params.athleteUserId),
        eq(providerProfiles.userId, params.coachUserId),
        eq(bookings.status, 'accepted'),
        gt(bookings.scheduledFor, params.now)
      )
    )
    .limit(1);
  return row !== undefined;
}

export type PathMutation =
  | { ok: true; path: StoredPath }
  | { ok: false; reason: string; message: string };

export async function closePath(params: {
  pathId: number;
  actorUserId: number;
  now: Date;
}): Promise<PathMutation> {
  const path = await loadPathById(params.pathId);
  if (!path) return { ok: false, reason: 'NOT_FOUND', message: 'Percorso non trovato.' };

  const future = await hasFutureAcceptedBooking({
    coachUserId: path.coachUserId,
    athleteUserId: path.athleteUserId,
    now: params.now,
  });
  const decision = authorizePathClosure({
    path,
    actorUserId: params.actorUserId,
    hasFutureAcceptedBooking: future,
  });
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason, message: decision.message };
  }

  await db
    .update(coachAthletePaths)
    .set({
      status: 'closed',
      closedAt: params.now,
      closedByRole: decision.outcome.closedByRole,
      closedBy: params.actorUserId,
      updatedDate: params.now,
      updatedBy: params.actorUserId,
    })
    .where(eq(coachAthletePaths.id, params.pathId));

  await db.insert(coachAthletePathEvents).values({
    pathId: params.pathId,
    event: 'closed',
    actorRole: decision.outcome.closedByRole,
    actorId: params.actorUserId,
  });

  const updated = await loadPathById(params.pathId);
  return updated
    ? { ok: true, path: updated }
    : { ok: false, reason: 'NOT_FOUND', message: 'Percorso non trovato.' };
}

export async function reopenPath(params: {
  pathId: number;
  actorUserId: number;
  now: Date;
}): Promise<PathMutation> {
  const path = await loadPathById(params.pathId);
  if (!path) return { ok: false, reason: 'NOT_FOUND', message: 'Percorso non trovato.' };

  const decision = authorizePathReopen({ path, actorUserId: params.actorUserId });
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason, message: decision.message };
  }

  await db
    .update(coachAthletePaths)
    .set({
      status: 'active',
      closedAt: null,
      closedByRole: null,
      closedBy: null,
      updatedDate: params.now,
      updatedBy: params.actorUserId,
    })
    .where(eq(coachAthletePaths.id, params.pathId));

  await db.insert(coachAthletePathEvents).values({
    pathId: params.pathId,
    event: 'reopened',
    actorRole: decision.outcome.role,
    actorId: params.actorUserId,
  });

  const updated = await loadPathById(params.pathId);
  return updated
    ? { ok: true, path: updated }
    : { ok: false, reason: 'NOT_FOUND', message: 'Percorso non trovato.' };
}

/**
 * L'atleta smette di condividere i propri contributi con questo coach.
 *
 * Il percorso resta attivo e niente viene cancellato: è il livello C dei
 * quattro, e ha un testo diverso dalla chiusura proprio perché è una cosa
 * diversa.
 */
export async function setContributionSharing(params: {
  pathId: number;
  actorUserId: number;
  shared: boolean;
  now: Date;
}): Promise<PathMutation> {
  const path = await loadPathById(params.pathId);
  if (!path) return { ok: false, reason: 'NOT_FOUND', message: 'Percorso non trovato.' };

  const decision = authorizeContributionRevocation({
    path,
    actorUserId: params.actorUserId,
  });
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason, message: decision.message };
  }

  await db
    .update(coachAthletePaths)
    .set({
      contributionsRevokedAt: params.shared ? null : params.now,
      updatedDate: params.now,
      updatedBy: params.actorUserId,
    })
    .where(eq(coachAthletePaths.id, params.pathId));

  const updated = await loadPathById(params.pathId);
  return updated
    ? { ok: true, path: updated }
    : { ok: false, reason: 'NOT_FOUND', message: 'Percorso non trovato.' };
}

/** I percorsi che coinvolgono uno di questi identificativi, in un colpo solo. */
export async function loadPathsByIds(ids: readonly number[]): Promise<StoredPath[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select(selection())
    .from(coachAthletePaths)
    .leftJoin(profiles, eq(profiles.userId, coachAthletePaths.coachUserId))
    .leftJoin(users, eq(users.id, coachAthletePaths.athleteUserId))
    .where(inArray(coachAthletePaths.id, [...ids]));
  return rows.map(hydrate);
}

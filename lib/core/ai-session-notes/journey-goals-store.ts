import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  athleteJourneyGoalSessions,
  athleteJourneyGoals,
} from '@/lib/db/schema';
import {
  parseJourneyGoalStatus,
  type GoalSessionLinks,
  type JourneyGoalStatus,
  type StoredJourneyGoal,
} from './journey-goals';

/**
 * Lettura e scrittura degli obiettivi del percorso.
 *
 * L'autorizzazione è la coppia: ogni query filtra su `coachUserId` **e**
 * `athleteUserId`. Un coach non vede e non tocca gli obiettivi che un altro
 * coach ha scritto per la stessa persona — sono due percorsi distinti, anche
 * quando l'atleta è lo stesso.
 */

export async function listJourneyGoals(params: {
  coachUserId: number;
  athleteUserId: number;
}): Promise<StoredJourneyGoal[]> {
  const rows = await db
    .select()
    .from(athleteJourneyGoals)
    .where(
      and(
        eq(athleteJourneyGoals.coachUserId, params.coachUserId),
        eq(athleteJourneyGoals.athleteUserId, params.athleteUserId),
        isNull(athleteJourneyGoals.archivedAt)
      )
    )
    .orderBy(asc(athleteJourneyGoals.position), asc(athleteJourneyGoals.id));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    isPrimary: row.isPrimary,
    status: parseJourneyGoalStatus(row.status),
    themeKey: row.themeKey,
    position: row.position,
    updatedAt: row.updatedDate,
  }));
}

export async function createJourneyGoal(params: {
  coachUserId: number;
  athleteUserId: number;
  title: string;
  themeKey: string | null;
  isPrimary: boolean;
  /** Le sedute in cui quel tema e' gia' emerso, per non partire da zero. */
  themeSessionIds?: readonly number[];
}): Promise<void> {
  const existing = await listJourneyGoals(params);
  // Il primo obiettivo di un percorso è il principale per definizione: nessuno
  // apre una scheda per scrivere l'obiettivo secondario.
  const isPrimary = params.isPrimary || existing.length === 0;

  if (isPrimary) await clearPrimary(params);

  const [created] = await db
    .insert(athleteJourneyGoals)
    .values({
      coachUserId: params.coachUserId,
      athleteUserId: params.athleteUserId,
      title: params.title,
      themeKey: params.themeKey,
      isPrimary,
      position: existing.length,
      createdBy: params.coachUserId,
      updatedBy: params.coachUserId,
    })
    .returning({ id: athleteJourneyGoals.id });

  // Le sedute in cui quel tema e' gia' emerso diventano subito storia
  // dell'obiettivo: un obiettivo nato oggi non parte da una traccia vuota su
  // un percorso che dura da mesi.
  if (created && params.themeSessionIds?.length) {
    await linkGoalSessions({
      goalId: created.id,
      sessionIds: params.themeSessionIds,
      source: 'theme',
      actorUserId: params.coachUserId,
    });
  }
}

export async function updateJourneyGoalStatus(params: {
  coachUserId: number;
  athleteUserId: number;
  goalId: number;
  status: JourneyGoalStatus;
}): Promise<void> {
  await db
    .update(athleteJourneyGoals)
    .set({
      status: params.status,
      updatedDate: new Date(),
      updatedBy: params.coachUserId,
    })
    .where(
      and(
        eq(athleteJourneyGoals.id, params.goalId),
        eq(athleteJourneyGoals.coachUserId, params.coachUserId),
        eq(athleteJourneyGoals.athleteUserId, params.athleteUserId)
      )
    );
}

export async function archiveJourneyGoal(params: {
  coachUserId: number;
  athleteUserId: number;
  goalId: number;
}): Promise<void> {
  await db
    .update(athleteJourneyGoals)
    .set({
      archivedAt: new Date(),
      updatedDate: new Date(),
      updatedBy: params.coachUserId,
    })
    .where(
      and(
        eq(athleteJourneyGoals.id, params.goalId),
        eq(athleteJourneyGoals.coachUserId, params.coachUserId),
        eq(athleteJourneyGoals.athleteUserId, params.athleteUserId)
      )
    );
}

/** L'indice unico ammette un solo principale attivo: si libera prima di scrivere. */
async function clearPrimary(params: {
  coachUserId: number;
  athleteUserId: number;
}): Promise<void> {
  await db
    .update(athleteJourneyGoals)
    .set({ isPrimary: false })
    .where(
      and(
        eq(athleteJourneyGoals.coachUserId, params.coachUserId),
        eq(athleteJourneyGoals.athleteUserId, params.athleteUserId),
        eq(athleteJourneyGoals.isPrimary, true),
        isNull(athleteJourneyGoals.archivedAt)
      )
    );
}

/**
 * Le sedute agganciate a ciascun obiettivo.
 *
 * Una lettura sola per tutti gli obiettivi della scheda: sono al massimo una
 * manciata di righe, e farne una query per obiettivo significherebbe pagare la
 * pagina in numero di obiettivi.
 */
export async function listGoalSessionLinks(
  goalIds: readonly number[]
): Promise<GoalSessionLinks> {
  if (goalIds.length === 0) return new Map();

  const rows = await db
    .select({
      goalId: athleteJourneyGoalSessions.goalId,
      sessionId: athleteJourneyGoalSessions.sessionAiNotesId,
    })
    .from(athleteJourneyGoalSessions)
    .where(inArray(athleteJourneyGoalSessions.goalId, [...goalIds]));

  const links = new Map<number, Set<number>>();
  for (const row of rows) {
    const bucket = links.get(row.goalId) ?? new Set<number>();
    bucket.add(row.sessionId);
    links.set(row.goalId, bucket);
  }
  return links;
}

/**
 * Scrive gli agganci mancanti. Idempotente: l'indice unico assorbe i doppioni,
 * e il riaggancio automatico gira a ogni approvazione.
 */
export async function linkGoalSessions(params: {
  goalId: number;
  sessionIds: readonly number[];
  source: 'theme' | 'coach';
  actorUserId: number | null;
}): Promise<void> {
  if (params.sessionIds.length === 0) return;

  await db
    .insert(athleteJourneyGoalSessions)
    .values(
      params.sessionIds.map((sessionAiNotesId) => ({
        goalId: params.goalId,
        sessionAiNotesId,
        source: params.source,
        createdBy: params.actorUserId,
      }))
    )
    .onConflictDoNothing();
}

/** Gli obiettivi di un atleta che portano una chiave di tema, per il riaggancio. */
export async function listGoalsWithThemeKey(
  athleteUserId: number
): Promise<Array<{ id: number; themeKey: string }>> {
  const rows = await db
    .select({
      id: athleteJourneyGoals.id,
      themeKey: athleteJourneyGoals.themeKey,
    })
    .from(athleteJourneyGoals)
    .where(
      and(
        eq(athleteJourneyGoals.athleteUserId, athleteUserId),
        isNull(athleteJourneyGoals.archivedAt)
      )
    );

  return rows.flatMap((row) =>
    row.themeKey ? [{ id: row.id, themeKey: row.themeKey }] : []
  );
}

/**
 * Riallinea gli agganci a partire dai temi ricorrenti.
 *
 * Gira all'apertura della scheda ed e' idempotente: scrive solo cio' che manca.
 * Sta qui e non nell'approvazione perche' deve **sanare anche il passato** —
 * gli obiettivi scritti prima che questa tabella esistesse non avrebbero mai
 * un aggancio, e resterebbero con la traccia vuota per sempre.
 *
 * Una volta scritto, il legame non si tocca piu': se il modello riformula il
 * tema, le sedute gia' agganciate restano. E' esattamente il difetto che
 * questa tabella risolve.
 */
export async function reconcileGoalSessionLinks(params: {
  athleteUserId: number;
  themes: ReadonlyArray<{ key: string; sessionIds: readonly number[] }>;
}): Promise<void> {
  if (params.themes.length === 0) return;

  const goals = await listGoalsWithThemeKey(params.athleteUserId);
  if (goals.length === 0) return;

  const byTheme = new Map(
    params.themes.map((theme) => [theme.key, theme.sessionIds])
  );
  const existing = await listGoalSessionLinks(goals.map((goal) => goal.id));

  for (const goal of goals) {
    const fromTheme = byTheme.get(goal.themeKey);
    if (!fromTheme) continue;
    const already = existing.get(goal.id) ?? new Set<number>();
    const missing = fromTheme.filter((sessionId) => !already.has(sessionId));
    if (missing.length === 0) continue;
    await linkGoalSessions({
      goalId: goal.id,
      sessionIds: missing,
      source: 'theme',
      actorUserId: null,
    });
  }
}

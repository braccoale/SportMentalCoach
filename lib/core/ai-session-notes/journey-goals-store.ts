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
  isPrimary: boolean;
  /** Le sedute in cui l'obiettivo e' gia' in gioco, indicate dal coach. */
  sessionIds?: readonly number[];
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
      isPrimary,
      position: existing.length,
      createdBy: params.coachUserId,
      updatedBy: params.coachUserId,
    })
    .returning({ id: athleteJourneyGoals.id });

  // Le sedute spuntate alla creazione diventano subito storia dell'obiettivo:
  // un obiettivo nato oggi non parte da una traccia vuota su un percorso che
  // dura da mesi.
  if (created && params.sessionIds?.length) {
    await linkGoalSessions({
      goalId: created.id,
      sessionIds: params.sessionIds,
      source: 'coach',
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
 * quindi un doppio invio del modulo non crea due volte lo stesso legame.
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

/**
 * Aggancia o sgancia una seduta da un obiettivo: e' il pallino su cui il coach
 * clicca nella riga.
 *
 * **Perche' un interruttore e non due funzioni separate.** Il comando parte dal
 * pallino, e il pallino sa gia' com'e' adesso: chiedergli anche di dire cosa
 * vuole diventare significherebbe far viaggiare uno stato che il server puo'
 * leggere da se'. Cosi' il doppio clic accidentale torna al punto di partenza
 * invece di scrivere due volte.
 *
 * L'autorizzazione e' la tripla, come per lo stato: l'obiettivo deve
 * appartenere a **questo** coach per **questo** atleta, altrimenti non si
 * scrive niente. Un id in un campo nascosto non e' una prova di niente.
 */
export async function toggleGoalSession(params: {
  coachUserId: number;
  athleteUserId: number;
  goalId: number;
  sessionId: number;
}): Promise<void> {
  const [goal] = await db
    .select({ id: athleteJourneyGoals.id })
    .from(athleteJourneyGoals)
    .where(
      and(
        eq(athleteJourneyGoals.id, params.goalId),
        eq(athleteJourneyGoals.coachUserId, params.coachUserId),
        eq(athleteJourneyGoals.athleteUserId, params.athleteUserId),
        isNull(athleteJourneyGoals.archivedAt)
      )
    )
    .limit(1);
  if (!goal) return;

  // Si prova prima a togliere: se c'era, l'operazione e' finita. Il contrario
  // — leggere, decidere, scrivere — lascerebbe una finestra fra la lettura e
  // la scrittura, e questo e' un solo comando.
  const removed = await db
    .delete(athleteJourneyGoalSessions)
    .where(
      and(
        eq(athleteJourneyGoalSessions.goalId, params.goalId),
        eq(athleteJourneyGoalSessions.sessionAiNotesId, params.sessionId)
      )
    )
    .returning({ id: athleteJourneyGoalSessions.id });
  if (removed.length > 0) return;

  await linkGoalSessions({
    goalId: params.goalId,
    sessionIds: [params.sessionId],
    source: 'coach',
    actorUserId: params.coachUserId,
  });
}

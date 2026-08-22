'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings } from '@/lib/core/bookings';
import { buildCoachAthletes } from '@/lib/core/bookings/coach-athletes';
import { parseJourneyGoalStatus } from '@/lib/core/ai-session-notes/journey-goals';
import {
  archiveJourneyGoal,
  createJourneyGoal,
  listAthleteSessionIds,
  toggleGoalSession,
  updateJourneyGoalStatus,
} from '@/lib/core/ai-session-notes/journey-goals-store';

/**
 * Le azioni sugli obiettivi del percorso.
 *
 * L'autorizzazione nasce dai dati, come nella pagina: `getCoachBookings`
 * restituisce solo le prenotazioni di questo coach, quindi un atleta che non
 * compare lì non ha mai lavorato con lui. Un id nel corpo della richiesta non
 * è una prova di niente, e questa è la sola barriera che non si può aggirare
 * scrivendo un numero diverso in un campo nascosto.
 */
async function requireOwnAthlete(athleteUserId: number): Promise<number> {
  const user = await requireRole('coach');
  if (!Number.isInteger(athleteUserId) || athleteUserId <= 0) {
    throw new Error('Atleta non valido.');
  }
  const bookings = await getCoachBookings(user.id);
  const isOwn = buildCoachAthletes(bookings).some(
    (athlete) => athlete.userId === athleteUserId
  );
  if (!isOwn) throw new Error('Atleta non trovato.');
  return user.id;
}

function athletePath(athleteUserId: number): string {
  return `/dashboard/coach/athletes/${athleteUserId}`;
}

function parsePositiveInt(raw: FormDataEntryValue | null): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function addJourneyGoalAction(formData: FormData): Promise<void> {
  const athleteUserId = Number(formData.get('athleteUserId'));
  const coachUserId = await requireOwnAthlete(athleteUserId);

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;

  // Le sedute spuntate dal coach: l'obiettivo nasce con la sua storia invece
  // che con una traccia vuota su un percorso che dura da mesi. Senza percorso
  // leggibile si crea lo stesso, solo senza storia — i pallini si accendono poi
  // uno a uno dalla riga.
  const allowed = await listAthleteSessionIds({ coachUserId, athleteUserId });
  const sessionIds = formData
    .getAll('sessionIds')
    .map((raw) => parsePositiveInt(raw))
    .filter((id): id is number => id !== null && allowed.has(id));

  await createJourneyGoal({
    coachUserId,
    athleteUserId,
    sessionIds,
    // Il limite della colonna: tagliare qui evita che il database rifiuti una
    // riga per un titolo lungo e il coach perda quello che aveva scritto.
    title: title.slice(0, 160),
    isPrimary: formData.get('isPrimary') === 'on',
  });

  revalidatePath(athletePath(athleteUserId));
}

export async function setJourneyGoalStatusAction(
  formData: FormData
): Promise<void> {
  const athleteUserId = Number(formData.get('athleteUserId'));
  const coachUserId = await requireOwnAthlete(athleteUserId);
  const goalId = Number(formData.get('goalId'));
  if (!Number.isInteger(goalId) || goalId <= 0) return;

  await updateJourneyGoalStatus({
    coachUserId,
    athleteUserId,
    goalId,
    status: parseJourneyGoalStatus(String(formData.get('status') ?? '')),
  });

  revalidatePath(athletePath(athleteUserId));
}

/**
 * Segna che una seduta ha toccato un obiettivo, o toglie il segno.
 *
 * È il pallino della riga: il coach lo clicca mentre rilegge il riepilogo, e
 * quel gesto è l'unica cosa che riempie la traccia. Prima l'aggancio si provava
 * a dedurlo dalla somiglianza fra le frasi dei temi, e su quindici obiettivi in
 * produzione non ne ha mai prodotto uno.
 */
export async function toggleJourneyGoalSessionAction(
  formData: FormData
): Promise<void> {
  const athleteUserId = Number(formData.get('athleteUserId'));
  const coachUserId = await requireOwnAthlete(athleteUserId);

  const goalId = parsePositiveInt(formData.get('goalId'));
  const sessionId = parsePositiveInt(formData.get('sessionId'));
  if (goalId === null || sessionId === null) return;

  const allowed = await listAthleteSessionIds({ coachUserId, athleteUserId });
  if (!allowed.has(sessionId)) return;

  await toggleGoalSession({ coachUserId, athleteUserId, goalId, sessionId });

  revalidatePath(athletePath(athleteUserId));
}

export async function archiveJourneyGoalAction(
  formData: FormData
): Promise<void> {
  const athleteUserId = Number(formData.get('athleteUserId'));
  const coachUserId = await requireOwnAthlete(athleteUserId);
  const goalId = Number(formData.get('goalId'));
  if (!Number.isInteger(goalId) || goalId <= 0) return;

  await archiveJourneyGoal({ coachUserId, athleteUserId, goalId });
  revalidatePath(athletePath(athleteUserId));
}

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings } from '@/lib/core/bookings';
import { buildCoachAthletes } from '@/lib/core/bookings/coach-athletes';
import { parseJourneyGoalStatus } from '@/lib/core/ai-session-notes/journey-goals';
import {
  archiveJourneyGoal,
  createJourneyGoal,
  updateJourneyGoalStatus,
} from '@/lib/core/ai-session-notes/journey-goals-store';
import {
  MentalJourneyError,
  getMentalJourney,
} from '@/lib/core/ai-session-notes/mental-journey';
import { mentalJourneyDependencies } from '@/lib/core/ai-session-notes/mental-journey-store';

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

export async function addJourneyGoalAction(formData: FormData): Promise<void> {
  const athleteUserId = Number(formData.get('athleteUserId'));
  const coachUserId = await requireOwnAthlete(athleteUserId);

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;

  const themeKey = String(formData.get('themeKey') ?? '').trim() || null;

  // Le sedute in cui quel tema e' gia' emerso: l'obiettivo nasce con la sua
  // storia invece che con una traccia vuota su un percorso che dura da mesi.
  let themeSessionIds: number[] = [];
  if (themeKey) {
    try {
      const journey = await getMentalJourney(
        { athleteUserId, actorUserId: coachUserId },
        mentalJourneyDependencies()
      );
      themeSessionIds =
        journey.recurringThemes.find((theme) => theme.key === themeKey)
          ?.sessionIds ?? [];
    } catch (error) {
      // Senza percorso leggibile l'obiettivo si crea lo stesso, solo senza
      // storia: il riallineamento all'apertura della scheda lo recupera.
      if (!(error instanceof MentalJourneyError)) throw error;
    }
  }

  await createJourneyGoal({
    coachUserId,
    athleteUserId,
    themeSessionIds,
    // Il limite della colonna: tagliare qui evita che il database rifiuti una
    // riga per un titolo lungo e il coach perda quello che aveva scritto.
    title: title.slice(0, 160),
    themeKey,
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

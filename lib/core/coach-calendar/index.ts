import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { providerProfiles } from '@/lib/db/schema';
import {
  getBookableDays,
  getCoachAvailabilityByProviderIds,
  getCoachBusyIntervalsByProviderIds,
  type BookableDay,
} from '@/lib/core/availability';
import { getBookingCreditContexts } from '@/lib/core/billing';
import { applyBookingCredits } from '@/lib/core/bookings';
import { getSystemConfigNumber } from '@/lib/core/system-config';

/**
 * Giorni e orari prenotabili di UN coach, chiesti quando si apre la finestra
 * di prenotazione e non a ogni caricamento dell'elenco.
 *
 * Perché esiste: l'elenco dei coach portava dentro, per ogni scheda, il
 * calendario di 90 giorni (≈ 530 KB di dati per 4 coach, anche se compressi
 * 26 KB) e doveva calcolarlo prima di mostrare qualsiasi cosa. Ora la scheda
 * sa solo se ci sono date; le date vere arrivano al clic.
 *
 * Le regole sono quelle di prima, scritte in un posto solo:
 *  - `intro`: le date del coach, come sul profilo;
 *  - `book`: le stesse date filtrate da `applyBookingCredits`, cioè quelle che
 *    il server accetterebbe per questo atleta (offrire e poi negare sembra un
 *    guasto). Richiede un utente: per chi non ha pagato non c'è niente da
 *    prenotare e la risposta è «nessuna data».
 */
export type CalendarKind = 'intro' | 'book';

export type CoachCalendar = {
  days: BookableDay[];
  /** Perché le date sono poche o nessuna (solo per `book`). */
  notice: string | null;
};

export async function getCoachCalendar(params: {
  slug: string;
  kind: CalendarKind;
  viewerUserId: number | null;
  now?: Date;
}): Promise<CoachCalendar | null> {
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(and(eq(providerProfiles.slug, params.slug), eq(providerProfiles.status, 'approved')))
    .limit(1);
  if (!provider) return null;

  const [availability, busy, stepMinutes, daysAhead] = await Promise.all([
    getCoachAvailabilityByProviderIds([provider.id]),
    getCoachBusyIntervalsByProviderIds([provider.id]),
    getSystemConfigNumber('AVAILABILITY_BOOKING_START_STEP_MINUTES', 10),
    getSystemConfigNumber('AVAILABILITY_BOOKING_DAYS_AHEAD', 90),
  ]);
  const days = getBookableDays(availability.get(provider.id) ?? [], {
    busyIntervals: busy.get(provider.id) ?? [],
    stepMinutes,
    daysAhead,
  });

  if (params.kind === 'intro') return { days, notice: null };

  if (params.viewerUserId === null) return { days: [], notice: null };
  const contexts = await getBookingCreditContexts(params.viewerUserId, [provider.id]);
  const context = contexts.get(provider.id);
  if (
    !context ||
    !context.requiresSubscription ||
    (!context.subscription && context.credits.length === 0)
  ) {
    return { days: [], notice: null };
  }
  const view = applyBookingCredits(
    { bookableDays: days, canCallNow: true },
    context,
    params.now ?? new Date()
  );
  return { days: view.bookableDays, notice: view.creditsNotice ?? null };
}

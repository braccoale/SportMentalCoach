import 'server-only';
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings, providerProfiles } from '@/lib/db/schema';

/**
 * Quali coach sono in chiamata **adesso**.
 *
 * Il segnale non è l'orario dell'appuntamento: una seduta fissata alle 18:00
 * può non essere mai iniziata, o essere finita dopo dieci minuti. Si guarda il
 * battito che il client manda mentre qualcuno è davvero collegato — lo stesso
 * che serve a misurare la durata reale della sessione. Se l'ultimo battito è
 * di pochi istanti fa, in quella stanza c'è qualcuno.
 *
 * È l'unica lettura che distingue «doveva esserci» da «c'è».
 */

/**
 * Oltre questo silenzio la sessione non è più considerata viva.
 *
 * Il battito arriva a intervalli regolari; due minuti lasciano spazio a un
 * ritardo di rete o a una scheda che rallenta, senza tenere accesa una spia
 * per una chiamata chiusa male — che è il modo più rapido per far smettere di
 * fidarsi di quella spia.
 */
export const LIVE_SESSION_SILENCE_MS = 2 * 60_000;

export function isSessionLive(
  lastHeartbeatAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!lastHeartbeatAt) return false;
  const silence = now.getTime() - lastHeartbeatAt.getTime();
  // Un battito dal futuro è un orologio sballato, non una sessione viva.
  return silence >= 0 && silence <= LIVE_SESSION_SILENCE_MS;
}

/** Gli id dei profili coach con una sessione viva in questo momento. */
export async function getLiveCoachProviderIds(
  now: Date = new Date()
): Promise<Set<number>> {
  const threshold = new Date(now.getTime() - LIVE_SESSION_SILENCE_MS);

  const rows = await db
    .select({ providerId: bookings.providerId })
    .from(bookings)
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .where(
      and(
        inArray(bookings.status, ['accepted', 'completed']),
        isNotNull(bookings.sessionStartedAt),
        gt(bookings.sessionEndedAt, threshold),
        // Un battito futuro non deve accendere niente.
        sql`${bookings.sessionEndedAt} <= ${now.toISOString()}::timestamp + interval '1 minute'`
      )
    )
    .groupBy(bookings.providerId);

  return new Set(rows.map((row) => row.providerId));
}

import 'server-only';
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings, providerProfiles } from '@/lib/db/schema';
import {
  LIVE_SESSION_SILENCE_MS,
  isSessionLive,
} from './live-session-state';

/**
 * Quali coach sono in chiamata **adesso**.
 *
 * La regola — quanto silenzio del battito rende morta una sessione — sta in
 * `live-session-state`, dove si può testare senza database. Qui c'è solo la
 * query che la applica a tutti i coach insieme.
 */

export { LIVE_SESSION_SILENCE_MS, isSessionLive };

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

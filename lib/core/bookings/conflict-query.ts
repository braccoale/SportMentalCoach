import { sql } from 'drizzle-orm';
import { bookings, services } from '@/lib/db/schema';
import { DEFAULT_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';

/**
 * Durata effettiva di una prenotazione in SQL: quella concordata per la
 * singola sessione se c'è, altrimenti quella del servizio, altrimenti il
 * default. Ogni calcolo di "quando finisce" deve passare da qui, altrimenti
 * una sessione da 60 minuti verrebbe considerata lunga quanto il servizio.
 *
 * Richiede che la query includa il join su `services`.
 */
export const effectiveBookingDurationMin = sql<number>`coalesce(${bookings.durationMin}, ${services.durationMin}, ${DEFAULT_SERVICE_DURATION_MIN})`;

/**
 * Matches an existing appointment whose calculated end is after the proposed
 * start. The timestamp encoder is required because values interpolated in raw
 * SQL fragments do not inherit the column encoder automatically.
 */
export function bookingEndsAfter(scheduledFor: Date) {
  return sql`${bookings.scheduledFor} + ${effectiveBookingDurationMin} * interval '1 minute' > ${sql.param(scheduledFor, bookings.scheduledFor)}`;
}

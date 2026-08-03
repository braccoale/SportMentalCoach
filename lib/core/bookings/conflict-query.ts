import { sql } from 'drizzle-orm';
import { bookings, services } from '@/lib/db/schema';
import { DEFAULT_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';

/**
 * Matches an existing appointment whose calculated end is after the proposed
 * start. The timestamp encoder is required because values interpolated in raw
 * SQL fragments do not inherit the column encoder automatically.
 */
export function bookingEndsAfter(scheduledFor: Date) {
  return sql`${bookings.scheduledFor} + coalesce(${services.durationMin}, ${DEFAULT_SERVICE_DURATION_MIN}) * interval '1 minute' > ${sql.param(scheduledFor, bookings.scheduledFor)}`;
}

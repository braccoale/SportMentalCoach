import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { notifications } from '@/lib/db/schema';

/** Evita un secondo avviso quando si ritenta la consegna di un report. */
export async function hasAiReportReadyNotification(
  athleteUserId: number,
  bookingId: number,
  reportId: number
): Promise<boolean> {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(
      eq(notifications.userId, athleteUserId),
      eq(notifications.type, 'ai_report_ready'),
      sql`${notifications.data}->>'bookingId' = ${String(bookingId)}`,
      sql`${notifications.data}->>'reportId' = ${String(reportId)}`
    ))
    .limit(1);
  return Boolean(row);
}

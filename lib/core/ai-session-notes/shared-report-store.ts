import 'server-only';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings, sessionAiNotes, sessionAiReports } from '@/lib/db/schema';
import type { SharedSessionReport } from './shared-report';

/**
 * Il riepilogo che il coach ha consegnato a **questo** atleta per **questa**
 * seduta.
 *
 * L'autorizzazione e' nella query, non prima: la riga si trova solo se la
 * prenotazione appartiene a chi sta chiedendo. Un id di prenotazione scritto a
 * mano nella barra degli indirizzi non restituisce niente, e non c'e' un
 * controllo separato che qualcuno possa dimenticare di chiamare.
 *
 * Legge `shared_report_json` e mai il report intero: quella colonna contiene
 * gia' soltanto cio' che puo' uscire, deciso da `buildSharedReport`. Non c'e'
 * nessun punto in cui il documento completo passi vicino all'atleta.
 */
export async function getSharedReportForAthlete(params: {
  bookingId: number;
  athleteUserId: number;
}): Promise<SharedSessionReport | null> {
  const [row] = await db
    .select({ shared: sessionAiReports.sharedReportJson })
    .from(sessionAiReports)
    .innerJoin(
      sessionAiNotes,
      eq(sessionAiNotes.id, sessionAiReports.sessionAiNotesId)
    )
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .where(
      and(
        eq(bookings.id, params.bookingId),
        eq(bookings.clientId, params.athleteUserId),
        isNotNull(sessionAiReports.sharedAt)
      )
    )
    .orderBy(desc(sessionAiReports.sharedAt))
    .limit(1);

  return (row?.shared as SharedSessionReport | undefined) ?? null;
}

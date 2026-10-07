/**
 * Quando una disdetta consuma la seduta.
 *
 * La regola, scelta dal proprietario del prodotto il 2026-10-07:
 *  - disdetta **nei tempi** (oltre il preavviso minimo): la seduta torna;
 *  - disdetta **tardiva dell'atleta** (sotto il preavviso, marcata
 *    `late_cancellation`): la seduta si consuma, come se fosse stata fatta;
 *  - annullo del **coach**: non consuma mai, anche se tardivo — la seduta
 *    mancata non è colpa dell'atleta;
 *  - annullo di sistema (rinnovo non pagato): non consuma.
 *
 * Il preavviso è il parametro di sistema
 * `BOOKING_CANCELLATION_MIN_NOTICE_MINUTES` (lo legge `cancelBooking`, che
 * scrive il segno `late_cancellation`); qui non si ricalcola, si legge il segno.
 * Chi ha annullato è `updated_by` della prenotazione annullata: uno stato
 * terminale, quindi l'ultimo a toccarla è chi l'ha annullata.
 *
 * Modulo puro. La stessa regola è scritta in SQL in `lib/core/billing/index.ts`
 * (`usageStatusSql` e `creditIsFreeSql`): chi la cambia cambia entrambi.
 */

export type CancellableBooking = {
  status: string;
  lateCancellation: boolean;
  /** `updated_by` della prenotazione, e l'atleta a cui appartiene. */
  updatedBy: number | null;
  clientId: number;
};

export function isConsumedByLateCancellation(b: CancellableBooking): boolean {
  return (
    b.status === 'cancelled' &&
    b.lateCancellation &&
    b.updatedBy !== null &&
    b.updatedBy === b.clientId
  );
}

/**
 * Lo stato con cui una prenotazione pesa su un abbonamento o su una seduta
 * acquistata: una disdetta tardiva dell'atleta pesa come una seduta fatta.
 */
export function usageStatusOf(b: CancellableBooking): string {
  return isConsumedByLateCancellation(b) ? 'completed' : b.status;
}

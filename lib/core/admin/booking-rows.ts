import type { CoachAthleteBooking } from '@/lib/core/bookings/coach-athletes';

/**
 * Una prenotazione come la carica l'amministrazione: con dentro anche di chi è.
 *
 * L'amministrazione guarda tutti i coach insieme, quindi ogni riga deve dire a
 * quale coach appartiene e come si chiama — informazioni che nella dashboard
 * del coach sono implicite, perché lì il coach è uno solo.
 *
 * Il tipo sta in un file suo perché di viste su queste righe ce ne sono due —
 * l'elenco degli atleti per coach e le sessioni di oggi — e la stessa query le
 * serve entrambe: una lettura sola del database, due letture diverse degli
 * stessi fatti.
 */
export type AdminBookingRow = CoachAthleteBooking & {
  /** Il profilo coach a cui la prenotazione appartiene. */
  providerId: number;
  /** Già risolto lato server: nome del profilo, nome e cognome, o email. */
  coachName: string;
  serviceTitle: string | null;
};

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
import type { ParticipantPresence } from './session-presence';

export type AdminBookingRow = CoachAthleteBooking & {
  /** Chi è entrato e chi ha accettato la trascrizione, per coach e atleta. */
  coachPresence?: ParticipantPresence;
  athletePresence?: ParticipantPresence;
  /** Il profilo coach a cui la prenotazione appartiene. */
  providerId: number;
  /** Già risolto lato server: nome del profilo, nome e cognome, o email. */
  coachName: string;
  serviceTitle: string | null;
  /**
   * La trascrizione AI è mai stata avviata per questa prenotazione (`session_ai_notes.started_at`
   * non nullo su almeno una riga) — non se è andata a buon fine, solo se è partita.
   * Opzionale: valorizzato solo dalle viste che lo interrogano (l'agenda giornaliera), assente
   * altrove (es. l'elenco atleti per coach), dove non serve.
   */
  aiTranscriptionActivated?: boolean;
  /** Stato dell'ultima riga `session_ai_notes` della prenotazione, o null. Stesse viste di sopra. */
  aiTranscriptionStatus?: string | null;
  /** Segmenti di trascrizione di quell'ultima riga. */
  aiTranscriptSegments?: number;
};

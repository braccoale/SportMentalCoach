import 'server-only';
import { getBookingChatContext } from '@/lib/core/messages';
import { canParticipateInSessions } from '@/lib/core/guardians';
import { isSessionJoinable } from '@/lib/core/sessions';

/**
 * Il collegamento alla stanza da rimandare all'atleta.
 *
 * Serve al coach quando all'altro è caduta la linea, o quando l'email del
 * promemoria si è persa. **Non è una scorciatoia d'accesso**: è il normale
 * percorso autenticato, e chi lo apre deve comunque entrare col proprio
 * account e superare i controlli del server. Nessuna credenziale della stanza
 * ci viaggia dentro.
 *
 * Vive qui, e non dentro la server action, perché lo chiedono due client: il
 * web con i cookie e l'app col token. La logica prende l'identità come
 * parametro invece di andarsela a prendere da sola — è ciò che permette di
 * averne una sola versione invece di due che prima o poi divergono.
 */
export type AthleteCallLinkResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export async function buildAthleteCallLink(
  bookingId: number,
  userId: number
): Promise<AthleteCallLinkResult> {
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return { ok: false, error: 'Sessione non valida.' };
  }

  const context = await getBookingChatContext(bookingId, userId);
  // L'atleta non deve mai poter generare un collegamento che sembri arrivare
  // dal proprio coach, anche se la destinazione è comunque autenticata.
  if (!context || context.coachUserId !== userId) {
    return { ok: false, error: 'Non sei autorizzato a inviare questo link.' };
  }
  if (context.status !== 'accepted') {
    return { ok: false, error: 'La sessione non è più disponibile.' };
  }
  if (!(await canParticipateInSessions(context.clientId)).ok) {
    return {
      ok: false,
      error: 'La sessione è bloccata: manca un’autorizzazione valida del tutore.',
    };
  }
  if (!isSessionJoinable(context.scheduledFor, context.durationMin)) {
    return { ok: false, error: 'La finestra della videochiamata è terminata.' };
  }

  return { ok: true, path: `/dashboard/video/${bookingId}` };
}

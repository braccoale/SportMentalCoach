import 'server-only';
import { getBookingChatContext } from '@/lib/core/messages';
import { isSessionJoinable } from '@/lib/core/sessions';
import { sendPushToUser } from '@/lib/core/push';
import { resolveDisplayName } from '@/lib/core/format';

/**
 * Fa squillare il telefono dell'altro partecipante quando si entra in stanza.
 *
 * Il popup in app arriva via Supabase Broadcast, ed è effimero per
 * costruzione: esiste solo se l'altra persona ha l'applicazione aperta in quel
 * momento. Chi ha il telefono in tasca non riceve niente — non «non sente il
 * suono»: proprio non gli arriva nulla. La notifica push è l'unico canale che
 * attraversa un'app chiusa, e senza di essa una videochiamata su appuntamento
 * dipende dal fatto che l'altro stia già guardando lo schermo.
 *
 * Best effort come tutto ciò che riguarda le notifiche: chi entra in stanza
 * non deve vedere un errore perché il servizio push non ha risposto.
 */

export type RingOutcome = 'sent' | 'not_participant' | 'not_joinable';

/**
 * Ogni quanto una stessa persona può essere fatta squillare per la stessa
 * sessione. Entrare e uscire dalla stanza rimonta il componente che chiama
 * questa funzione, e senza un freno la seconda persona riceverebbe una raffica
 * di notifiche per una sola chiamata.
 */
export const RING_THROTTLE_MS = 60_000;

/**
 * Vive in memoria e si azzera a ogni istanza fredda, come il freno gemello
 * della sveglia del worker. Non serve una garanzia globale: serve che un
 * rientro in stanza non suoni due volte di fila.
 */
const lastRingAt = new Map<string, number>();

export async function ringCounterpart(
  bookingId: number,
  userId: number,
  now: number = Date.now()
): Promise<RingOutcome> {
  const context = await getBookingChatContext(bookingId, userId);
  if (!context || context.status !== 'accepted') return 'not_participant';

  // Non si squilla fuori dalla finestra della sessione: un link riaperto il
  // giorno dopo non deve far vibrare il telefono di nessuno.
  if (
    !isSessionJoinable(
      context.scheduledFor ? new Date(context.scheduledFor) : null,
      context.durationMin,
      new Date(now)
    )
  ) {
    return 'not_joinable';
  }

  const isCoach = userId === context.coachUserId;
  const targetUserId = isCoach ? context.clientId : context.coachUserId;
  // Il coach non ha un'email in questo contesto: se manca il nome resta un
  // termine generico, mai un indirizzo di ripiego preso da un'altra persona.
  const callerName = isCoach
    ? context.coachName?.trim() || 'Il tuo coach'
    : resolveDisplayName(context.clientName, context.clientEmail);

  const key = `${bookingId}:${targetUserId}`;
  const previous = lastRingAt.get(key);
  if (previous !== undefined && now - previous < RING_THROTTLE_MS) {
    return 'sent';
  }
  lastRingAt.set(key, now);

  await sendPushToUser(targetUserId, {
    title: `${callerName} ti sta chiamando`,
    body: context.serviceTitle ?? 'Videochiamata KaiPai in corso',
    url: `/dashboard/video/${bookingId}`,
    // Lo stesso tag sostituisce la notifica precedente invece di impilarne
    // una nuova: una chiamata, una riga nel centro notifiche.
    tag: `call-${bookingId}`,
    // Una chiamata non è un avviso qualunque: resta finché non la si guarda,
    // e vibra come tale.
    requireInteraction: true,
    vibrate: [500, 300, 500, 300, 500],
  });

  return 'sent';
}

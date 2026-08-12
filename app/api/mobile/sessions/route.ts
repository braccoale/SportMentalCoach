import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { getApiUser } from '@/lib/auth/api-user';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  profiles,
  providerProfiles,
  services,
  users,
  sessionAiNotes,
} from '@/lib/db/schema';
import {
  FALLBACK_SESSION_DURATION_MIN,
  canJoinVideoNow,
} from '@/lib/core/sessions';

/**
 * Le sessioni che l'app deve mostrare: poche, imminenti, con dentro solo ciò
 * che serve per entrare in chiamata.
 *
 * Non è la dashboard in miniatura. L'app esiste per una cosa sola — essere in
 * chiamata dal telefono — e questa lista è il minimo per arrivarci: chi,
 * quando, e l'identificativo con cui chiedere il token. Storico, chat,
 * riepiloghi e prenotazioni restano sul web, dove c'è lo spazio per leggerli.
 */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // Quanto passato si porta dietro l'app. Non è lo storico completo — quello
  // sta sul web con i riepiloghi — ma «le ultime settimane», che è ciò che
  // serve per ricordarsi quando si è parlato l'ultima volta.
  const horizon = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      bookingId: bookings.id,
      scheduledFor: bookings.scheduledFor,
      durationMin: sql<number>`coalesce(${bookings.durationMin}, ${services.durationMin}, ${FALLBACK_SESSION_DURATION_MIN})`,
      serviceTitle: services.title,
      clientId: bookings.clientId,
      coachUserId: providerProfiles.userId,
      coachName: profiles.displayName,
      clientName: sql<
        string | null
      >`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
      clientEmail: users.email,
      status: bookings.status,
      sessionStartedAt: bookings.sessionStartedAt,
      sessionEndedAt: bookings.sessionEndedAt,
      aiNotesStatus: sessionAiNotes.status,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    // Il riepilogo AI, se esiste: serve solo a dire che c'e' e a che punto e'.
    .leftJoin(sessionAiNotes, eq(sessionAiNotes.bookingId, bookings.id))
    .where(
      and(
        /*
         * Non solo `accepted`.
         *
         * Prima qui passavano soltanto le sessioni gia' confermate, e una
         * richiesta appena inviata dal web semplicemente non esisteva per
         * l'app: si guardava un elenco vuoto senza alcun indizio del perche'.
         * Una richiesta in attesa e' esattamente la cosa che si vuole
         * controllare dal telefono.
         */
        /*
         * `requested`, non `pending`.
         *
         * Gli stati veri di una prenotazione sono requested / accepted /
         * declined / cancelled / completed / expired. `pending` non e' mai
         * esistito: filtrando su un valore inventato, **nessuna richiesta ha
         * mai raggiunto l'app** — un coach vedeva l'elenco fermo mentre un
         * atleta aspettava una risposta, e nulla segnalava il problema perche'
         * una query che non trova righe non e' un errore.
         */
        /*
         * Anche annullate e rifiutate.
         *
         * Sparivano dall'elenco, e sparire e' ambiguo: chi guarda non sa se
         * la sessione non c'e' mai stata, se e' stata disdetta o se l'app non
         * la carica. Restano nelle passate, con lo stato scritto.
         */
        inArray(bookings.status, [
          'accepted',
          'requested',
          'completed',
          'cancelled',
          'declined',
          'expired',
        ]),
        or(
          eq(bookings.clientId, user.id),
          eq(providerProfiles.userId, user.id)
        ),
        // Le richieste senza orario non compaiono: non c'è una chiamata da
        // raggiungere, e in un elenco di «prossime» sarebbero rumore.
        gte(bookings.scheduledFor, horizon)
      )
    )
    .orderBy(desc(bookings.scheduledFor))
    .limit(60);

  const all = rows.map((row) => {
    const viewerIsCoach = row.coachUserId === user.id;
    return {
      bookingId: row.bookingId,
      scheduledFor: row.scheduledFor?.toISOString() ?? null,
      durationMin: Number(row.durationMin),
      title: row.serviceTitle ?? 'Sessione di mental coaching',
      status: row.status,
      /*
       * Quanto e' durata davvero, non quanto era prevista.
       *
       * Una sessione da quaranta minuti finita in dodici racconta qualcosa —
       * ed e' un'informazione che esiste solo dopo, quindi la durata prevista
       * non la sostituisce.
       */
      /*
       * Se di questa sessione esiste un riepilogo, e a che punto e'.
       *
       * Sulla scheda diventa un segno: senza, l'unico modo di sapere se una
       * seduta ha prodotto qualcosa e' aprirla sul web una per una.
       */
      aiNotes: row.aiNotesStatus ?? null,
      actualMinutes:
        row.sessionStartedAt && row.sessionEndedAt
          ? Math.max(
              1,
              Math.round(
                (row.sessionEndedAt.getTime() - row.sessionStartedAt.getTime()) /
                  60_000
              )
            )
          : null,
      /*
       * La stanza si apre poco prima, non appena la sessione compare.
       *
       * La regola e' , la stessa del web: senza, l'app
       * offriva «Entra nella stanza» per una sessione delle 18 gia' alle 13, e
       * chi la premeva trovava un rifiuto del server. Meglio non offrire che
       * offrire e negare.
       */
      canJoinNow: canJoinVideoNow(
        row.scheduledFor,
        Number(row.durationMin)
      ),
      viewerIsCoach,
      otherName: viewerIsCoach
        ? row.clientName ?? row.clientEmail
        : row.coachName ?? 'Coach',
    };
  });

  /*
   * Il confine fra «prossime» e «passate» è la **fine** della sessione, non
   * l'inizio.
   *
   * Prima bastava che fossero passate due ore dall'orario d'inizio: una
   * tolleranza pensata per chi entra in ritardo, che però teneva in cima
   * all'elenco una sessione da quaranta minuti finita da un'ora. Chi guarda
   * vede una cosa conclusa presentata come imminente, e smette di fidarsi
   * dell'ordine.
   *
   * La coda di grazia resta, ma parte da quando la sessione finisce: qualche
   * minuto in cui si può ancora rientrare se è caduta la linea.
   */
  const GRACE_MIN = 15;
  const isUpcoming = (session: { scheduledFor: string | null; durationMin: number }) => {
    if (!session.scheduledFor) return false;
    const endsAt =
      new Date(session.scheduledFor).getTime() +
      (session.durationMin + GRACE_MIN) * 60_000;
    return endsAt >= Date.now();
  };

  return Response.json({
    // Le prossime in ordine di arrivo: la più imminente per prima.
    sessions: all
      /*
       * Annullate, rifiutate e scadute non sono «in arrivo».
       *
       * Restavano fra le prossime con tanto di conto alla rovescia: una
       * sessione disdetta annunciata come «fra 71 minuti» e' peggio di non
       * mostrarla, perche' qualcuno potrebbe presentarsi.
       */
      .filter(
        (s) =>
          isUpcoming(s) &&
          (s.status === 'accepted' || s.status === 'requested')
      )
      .sort((a, b) =>
        (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? '')
      ),
    // Le passate al contrario: la più recente per prima, che è quella che si
    // cerca quando si guarda indietro.
    past: all.filter(
      (s) =>
        !isUpcoming(s) ||
        !(s.status === 'accepted' || s.status === 'requested')
    ),
  });
}

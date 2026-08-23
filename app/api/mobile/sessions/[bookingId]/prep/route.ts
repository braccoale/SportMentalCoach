import { and, eq, or } from 'drizzle-orm';
import { getApiUser } from '@/lib/auth/api-user';
import { db } from '@/lib/db/drizzle';
import { bookings, providerProfiles } from '@/lib/db/schema';
import {
  MentalJourneyError,
  getMentalJourney,
} from '@/lib/core/ai-session-notes/mental-journey';
import { mentalJourneyDependencies } from '@/lib/core/ai-session-notes/mental-journey-store';

/**
 * «Da portare in questa seduta», come serve su un telefono.
 *
 * Sul web e' una sezione della pagina della seduta; qui e' la risposta a una
 * domanda sola, fatta in piedi due minuti prima della call: «cosa devo
 * riprendere oggi?». Quindi non il percorso — metriche, grafici, storia — ma
 * i soli punti, con la loro provenienza.
 *
 * La regola non viene riscritta: la decide `getMentalJourney`, la stessa
 * funzione che serve il web, autorizzazione compresa. Questa rotta esiste
 * perche' il percorso intero e' un documento grande e al telefono servono
 * cinque righe, non perche' il telefono decida qualcosa di diverso.
 */

/** Oltre cinque non si leggono stando in piedi, e non e' piu' una preparazione. */
const MAX_POINTS = 5;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { bookingId } = await params;
  const id = Number(bookingId);
  if (!Number.isInteger(id)) {
    return Response.json({ error: 'invalid_booking' }, { status: 400 });
  }

  const [row] = await db
    .select({
      clientId: bookings.clientId,
      coachUserId: providerProfiles.userId,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .where(
      and(
        eq(bookings.id, id),
        // Solo chi partecipa alla seduta, come nella rotta sorella: un
        // identificativo scritto a mano non deve bastare a leggere cosa il
        // coach di qualcun altro si e' segnato.
        or(eq(bookings.clientId, user.id), eq(providerProfiles.userId, user.id))
      )
    )
    .limit(1);

  if (!row) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  /*
   * Solo il coach.
   *
   * E' la stessa condizione del web (`booking.viewerRole === 'coach'` sulla
   * pagina della seduta): questi punti nascono dai riepiloghi, che sono
   * materiale del coach. All'atleta non vengono negati per prudenza — non
   * sono suoi.
   */
  if (row.coachUserId !== user.id) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const journey = await getMentalJourney(
      { athleteUserId: row.clientId, actorUserId: user.id },
      mentalJourneyDependencies()
    );
    return Response.json({
      points: journey.pointsToRevisit.slice(0, MAX_POINTS).map((point) => ({
        id: point.id,
        text: point.text,
        sourceLabel: point.sourceLabel,
        fromDraft: point.fromDraft,
      })),
    });
  } catch (error) {
    /*
     * Un percorso che non si puo' costruire non e' un guasto da mostrare: e'
     * un coach che non ha ancora niente da riprendere. Stessa scelta del web,
     * che qui fa `catch (MentalJourneyError) => null`.
     */
    if (error instanceof MentalJourneyError) {
      return Response.json({ points: [] });
    }
    throw error;
  }
}

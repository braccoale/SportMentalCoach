import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getApiUser } from '@/lib/auth/api-user';
import { db } from '@/lib/db/drizzle';
import { bookings, providerProfiles, users } from '@/lib/db/schema';
import { getCoachServices } from '@/lib/core/services';
import { createCoachBookingRequest } from '@/lib/core/bookings';
import {
  DEFAULT_SESSION_DURATION_MIN,
  type SessionDurationMin,
} from '@/lib/core/bookings/duration';

/**
 * Creare un appuntamento dal telefono: cosa scegliere, e la creazione.
 *
 * `GET` restituisce le due liste che servono — gli atleti con cui il coach ha
 * già lavorato e i suoi servizi — perché un telefono non è il posto per
 * cercare una persona in un elenco di tutti: si sceglie fra pochi nomi noti.
 *
 * `POST` crea. Le regole restano di `createCoachBookingRequest`, che verifica
 * che l'atleta sia davvero un cliente di questo coach e che il servizio gli
 * appartenga: senza quel controllo, un identificativo scritto a mano
 * basterebbe a prenotare per conto d'altri.
 */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, user.id))
    .limit(1);

  // Chi non è coach non crea appuntamenti: liste vuote, e l'app non mostra
  // nulla invece di mostrare un modulo che fallirebbe all'invio.
  if (!provider) return Response.json({ athletes: [], services: [] });

  const athletes = await db
    .selectDistinctOn([bookings.clientId], {
      userId: bookings.clientId,
      name: sql<
        string | null
      >`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
      email: users.email,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.clientId))
    .where(and(eq(bookings.providerId, provider.id), isNull(users.deletedAt)))
    .orderBy(bookings.clientId, desc(bookings.createdAt))
    .limit(100);

  const services = await getCoachServices(user.id);

  return Response.json({
    athletes: athletes.map((a) => ({
      userId: a.userId,
      name: a.name ?? a.email,
    })),
    services: services.map((s) => ({
      id: s.id,
      title: s.title,
      durationMin: s.durationMin,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  let body: {
    clientUserId?: unknown;
    serviceId?: unknown;
    durationMin?: unknown;
    scheduledFor?: unknown;
    startingNow?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  const startingNow = body.startingNow === true;

  if (
    typeof body.clientUserId !== 'number' ||
    typeof body.serviceId !== 'number' ||
    (!startingNow && typeof body.scheduledFor !== 'string')
  ) {
    return Response.json({ error: 'Dati incompleti.' }, { status: 400 });
  }

  /*
   * Una sessione immediata non ha un orario scelto: parte adesso, e nasce
   * gia' accettata perche' i due sono entrambi presenti — chiedere conferma a
   * chi ti sta gia' aspettando in stanza sarebbe assurdo.
   */
  const scheduledFor = startingNow
    ? new Date()
    : new Date(body.scheduledFor as string);
  if (Number.isNaN(scheduledFor.getTime())) {
    return Response.json({ error: 'Data non valida.' }, { status: 400 });
  }

  const result = await createCoachBookingRequest({
    coachUserId: user.id,
    clientUserId: body.clientUserId,
    serviceId: body.serviceId,
    durationMin: (typeof body.durationMin === 'number'
      ? body.durationMin
      : DEFAULT_SESSION_DURATION_MIN) as SessionDurationMin,
    scheduledFor,
    startingNow,
  });

  return result.ok
    ? Response.json({ ok: true, bookingId: result.bookingId })
    : Response.json({ error: result.error }, { status: 400 });
}

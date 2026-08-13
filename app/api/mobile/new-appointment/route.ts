import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getApiUser } from '@/lib/auth/api-user';
import { db } from '@/lib/db/drizzle';
import { bookings, providerProfiles, users } from '@/lib/db/schema';
import { getCoachServices } from '@/lib/core/services';
import {
  getBookableDays,
  getCoachAvailability,
  getCoachBusyIntervalsByProviderIds,
  parseRomeLocalDateTime,
} from '@/lib/core/availability';
import {
  busyIntervalsAt,
  dropPastStarts,
  slotPresentation,
} from '@/lib/core/availability/validation';
import { createCoachBookingRequest } from '@/lib/core/bookings';
import {
  DEFAULT_SESSION_DURATION_MIN,
  SESSION_DURATION_OPTIONS,
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

  /*
   * Gli orari veri del coach, gli stessi che vede sul web.
   *
   * L'app proponeva un elenco fisso di ore piene — 8, 9, 10 — scritto nel
   * codice dell'applicazione: ignorava la disponibilita' settimanale del
   * coach, gli appuntamenti gia' presi e la durata scelta. Dal telefono si
   * poteva quindi proporre un orario che il coach non lavora, o uno gia'
   * occupato, e il rifiuto arrivava solo al momento dell'invio.
   *
   * Ora la lista la calcola `getBookableDays`, la stessa funzione della
   * dashboard: una regola sola, in un posto solo.
   */
  const [availability, busyByProvider] = await Promise.all([
    getCoachAvailability(user.id),
    getCoachBusyIntervalsByProviderIds([provider.id]),
  ]);

  const now = new Date();
  const days = dropPastStarts(
    getBookableDays(availability, {
      busyIntervals: busyIntervalsAt(busyByProvider.get(provider.id) ?? [], now),
    }),
    now
  );

  /*
   * Occupato, stretto o libero: lo decide il server, non l'app.
   *
   * Il giudizio su un orario non e' un dato ma una **regola** — «ci stanno i
   * minuti che servono prima del prossimo appuntamento?» — e ricopiarla nel
   * codice dell'app significherebbe ricreare la divergenza che stiamo
   * chiudendo. Qui gira `slotPresentation`, la stessa che disegna l'elenco
   * sul web: se un giorno cambia, cambia per entrambi nello stesso istante.
   *
   * La durata arriva da chi chiede, perche' da lei dipende: alle 10:30, con
   * una sessione alle 11, trenta minuti ci stanno e quaranta no.
   */
  const durationParam = Number(
    new URL(request.url).searchParams.get('durationMin')
  );
  const durationMin = Number.isFinite(durationParam) && durationParam > 0
    ? durationParam
    : null;

  const bookableDays = days.map((day) => ({
    value: day.value,
    label: day.label,
    slots: day.times.map((time) => {
      const slot = slotPresentation(day.maxDurationMin, time, durationMin, true);
      return {
        time,
        suffix: slot.suffix,
        selectable: slot.selectable,
        tone: slot.tone,
        fitsDurationMin: slot.fitsDurationMin,
      };
    }),
  }));

  /*
   * L'ultimo servizio usato con ciascun atleta.
   *
   * Con la stessa persona un coach ripete quasi sempre lo stesso servizio: e`
   * il default che vale un tocco risparmiato. Come sul web, se quel servizio
   * non e' piu' offerto non si propone: meglio chiedere che proporre un
   * valore che fallirebbe.
   */
  const lastServices = await db
    .selectDistinctOn([bookings.clientId], {
      clientId: bookings.clientId,
      serviceId: bookings.serviceId,
    })
    .from(bookings)
    .where(eq(bookings.providerId, provider.id))
    .orderBy(bookings.clientId, desc(bookings.createdAt));

  const offered = new Set(services.map((s) => s.id));
  const lastServiceByAthlete: Record<number, number> = {};
  for (const row of lastServices) {
    if (row.serviceId && offered.has(row.serviceId)) {
      lastServiceByAthlete[row.clientId] = row.serviceId;
    }
  }

  return Response.json({
    bookableDays,
    lastServiceByAthlete,
    durationOptions: SESSION_DURATION_OPTIONS,
    defaultDurationMin: DEFAULT_SESSION_DURATION_MIN,
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
  /*
   * L'orario arriva come ora italiana — «2026-08-14T10:10» — e va letto come
   * tale, con la stessa funzione del web.
   *
   * Interpretarlo con `new Date()` lo leggerebbe nel fuso di chi scrive: un
   * atleta in vacanza fuori Italia avrebbe visto l'appuntamento spostarsi di
   * ore senza che nessuno l'avesse toccato.
   */
  const scheduledFor = startingNow
    ? new Date()
    : parseRomeLocalDateTime(body.scheduledFor as string) ??
      new Date(body.scheduledFor as string);
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

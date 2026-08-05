import 'server-only';
import { alias } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  clientProfiles,
  providerProfiles,
  services,
  sports,
  users,
} from '@/lib/db/schema';
import {
  displayName,
  formatDateTimeIt,
  formatDurationIt,
  roleLabelIt,
} from './format';
import { effectiveBookingDurationMin } from '@/lib/core/bookings/conflict-query';
import { buildBookingGoogleCalendarUrl } from '@/lib/core/booking-calendar';
import { getAppBaseUrl } from '@/lib/core/app-url';
import type { DetailsCard } from './details-card';

/**
 * Arricchimento dei dati di un appuntamento per le email.
 *
 * Perché centralizzato. I call-site di `notify()` passano il minimo
 * indispensabile (`bookingId`, poco altro): è giusto così, il dominio non deve
 * sapere cosa serve a un'email. Ma un'email utile ha bisogno di nome di chi ha
 * agito, titolo del servizio, orario proposto, sport. Recuperarli qui, una
 * volta sola, evita di modificare dieci call-site e garantisce che tutte le
 * email dicano le stesse cose.
 *
 * Il costo è una query, eseguita nel ramo email che gira già dentro `after()`:
 * arriva dopo la risposta HTTP, quindi non aggiunge latenza all'azione.
 */

export type BookingParticipant = {
  userId: number;
  displayName: string | null;
};

export type BookingEmailData = {
  bookingId: number;
  status: string;
  /** Quando l'atleta ha inviato la richiesta. */
  requestedAt: Date;
  /** Quando si terrà la sessione. Nullable: esistono richieste senza orario. */
  scheduledFor: Date | null;
  serviceTitle: string | null;
  durationMin: number | null;
  /** Messaggio scritto dall'atleta al momento della richiesta. */
  note: string | null;
  athlete: BookingParticipant & { sport: string | null; goals: string | null };
  coach: BookingParticipant;
};

export async function loadBookingEmailData(
  bookingId: number
): Promise<BookingEmailData | null> {
  const coachUser = alias(users, 'coach_user');

  const [row] = await db
    .select({
      bookingId: bookings.id,
      status: bookings.status,
      requestedAt: bookings.requestedAt,
      scheduledFor: bookings.scheduledFor,
      note: bookings.note,
      serviceTitle: services.title,
      // La durata concordata per questa sessione, non quella del servizio:
      // l'email deve dire la stessa cosa che il coach ha scelto nel form.
      durationMin: effectiveBookingDurationMin,
      athleteUserId: users.id,
      athleteName: users.name,
      athleteLastName: users.lastName,
      athleteEmail: users.email,
      athleteSportKey: clientProfiles.category,
      athleteSportLabel: sports.label,
      athleteGoals: clientProfiles.goals,
      coachUserId: coachUser.id,
      coachName: coachUser.name,
      coachLastName: coachUser.lastName,
      coachEmail: coachUser.email,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.clientId, users.id))
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .innerJoin(coachUser, eq(providerProfiles.userId, coachUser.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .leftJoin(sports, eq(sports.key, clientProfiles.category))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) return null;

  return {
    bookingId: row.bookingId,
    status: row.status,
    requestedAt: row.requestedAt,
    scheduledFor: row.scheduledFor,
    serviceTitle: row.serviceTitle?.trim() || null,
    durationMin: row.durationMin ?? null,
    note: row.note?.trim() || null,
    athlete: {
      userId: row.athleteUserId,
      displayName: displayName({
        name: row.athleteName,
        lastName: row.athleteLastName,
        email: row.athleteEmail,
      }),
      // La tassonomia ha l'etichetta leggibile; la chiave grezza è il ripiego.
      sport: row.athleteSportLabel?.trim() || row.athleteSportKey?.trim() || null,
      goals: row.athleteGoals?.trim() || null,
    },
    coach: {
      userId: row.coachUserId,
      displayName: displayName({
        name: row.coachName,
        lastName: row.coachLastName,
        email: row.coachEmail,
      }),
    },
  };
}

/** Ruolo di un utente rispetto all'appuntamento. */
export function participantRole(
  data: BookingEmailData,
  userId: number | null | undefined
): 'athlete' | 'coach' | null {
  if (userId == null) return null;
  if (userId === data.athlete.userId) return 'athlete';
  if (userId === data.coach.userId) return 'coach';
  return null;
}

/**
 * Locuzione da usare nella prosa: "una sessione Conoscitiva" quando il
 * servizio è noto, il generico "una sessione" quando `service_id` è nullo.
 *
 * Deve essere una locuzione completa, non il solo titolo: interpolare un
 * titolo mancante dentro "una sessione {{titolo}}" produce "una sessione
 * sessione", e un fallback vuoto lascerebbe la frase monca. Costruirla qui è
 * l'unico modo di ottenere una frase corretta in entrambi i casi.
 */
export function sessionLabel(data: BookingEmailData): string {
  return data.serviceTitle ? `una sessione ${data.serviceTitle}` : 'una sessione';
}

const MAX_NOTE_LENGTH = 280;

/**
 * Card dei dettagli per gli eventi di appuntamento.
 *
 * Le righe senza valore vengono omesse a valle da `details-card.ts`: qui si
 * dichiara cosa mostrare, non si controlla cosa esiste.
 *
 * Sport, obiettivo e nota compaiono solo su `booking_requested`, dove servono
 * al coach per decidere se accettare. Altrove appesantirebbero senza aggiungere
 * nulla.
 */
export function buildBookingCard(input: {
  eventKey: string;
  data: BookingEmailData;
  /** Chi ha compiuto l'azione, se noto. */
  actorUserId?: number | null;
  /** Quando è avvenuta l'azione. */
  occurredAt: Date;
  /** Ruolo del destinatario, per scegliere la controparte da mostrare. */
  recipientRole: 'athlete' | 'coach' | null;
}): DetailsCard {
  const { data, eventKey } = input;
  const actorRole = participantRole(data, input.actorUserId);
  const actorName =
    actorRole === 'coach'
      ? data.coach.displayName
      : actorRole === 'athlete'
        ? data.athlete.displayName
        : null;

  const counterpart =
    input.recipientRole === 'coach' ? data.athlete : data.coach;
  const counterpartRole = input.recipientRole === 'coach' ? 'athlete' : 'coach';

  const sessionAt = formatDateTimeIt(data.scheduledFor);
  const occurredAtLabel = formatDateTimeIt(input.occurredAt);
  const duration = formatDurationIt(data.durationMin);

  switch (eventKey) {
    case 'booking_requested':
      return {
        rows: [
          { label: 'Richiedente', value: data.athlete.displayName },
          { label: 'Ruolo', value: roleLabelIt('athlete') },
          { label: 'Tipo di sessione', value: data.serviceTitle },
          { label: 'Sport', value: data.athlete.sport },
          { label: 'Obiettivo', value: truncate(data.athlete.goals, 120) },
          {
            label: 'Richiesta inviata',
            value: formatDateTimeIt(data.requestedAt),
          },
          {
            label: 'Sessione proposta',
            value: sessionAt,
            emphasis: true,
            separatorBefore: true,
          },
          { label: 'Durata', value: duration },
        ],
        quote: data.note
          ? { text: truncate(data.note, MAX_NOTE_LENGTH)!, attribution: data.athlete.displayName }
          : null,
      };

    case 'booking_created_by_coach':
      return {
        rows: [
          { label: 'Coach', value: data.coach.displayName },
          { label: 'Tipo di sessione', value: data.serviceTitle },
          { label: 'Fissata il', value: occurredAtLabel },
          { label: 'La tua sessione', value: sessionAt, emphasis: true, separatorBefore: true },
          { label: 'Durata', value: duration },
        ],
      };

    case 'booking_accepted':
      return {
        rows: [
          { label: 'Coach', value: data.coach.displayName },
          { label: 'Tipo di sessione', value: data.serviceTitle },
          { label: 'Confermata il', value: occurredAtLabel },
          { label: 'La tua sessione', value: sessionAt, emphasis: true, separatorBefore: true },
          { label: 'Durata', value: duration },
        ],
      };

    case 'booking_declined':
      return {
        rows: [
          { label: 'Coach', value: data.coach.displayName },
          { label: 'Tipo di sessione', value: data.serviceTitle },
          { label: 'Richiesta del', value: formatDateTimeIt(data.requestedAt) },
          { label: 'Orario richiesto', value: sessionAt },
        ],
      };

    case 'booking_cancelled':
      return {
        rows: [
          { label: 'Annullata da', value: joinRole(actorName, actorRole) },
          { label: 'Tipo di sessione', value: data.serviceTitle },
          { label: 'Annullata il', value: occurredAtLabel },
          {
            label: 'Sessione annullata',
            value: sessionAt,
            emphasis: true,
            separatorBefore: true,
          },
        ],
      };

    case 'booking_rescheduled':
      return {
        rows: [
          { label: 'Modificata da', value: joinRole(actorName, actorRole) },
          { label: 'Tipo di sessione', value: data.serviceTitle },
          { label: 'Modificata il', value: occurredAtLabel },
          {
            label: 'Nuovo orario',
            value: sessionAt,
            emphasis: true,
            separatorBefore: true,
          },
          { label: 'Durata', value: duration },
        ],
      };

    case 'booking_completed':
      return {
        rows: [
          { label: 'Coach', value: data.coach.displayName },
          { label: 'Tipo di sessione', value: data.serviceTitle },
          { label: 'Svolta il', value: sessionAt },
          { label: 'Durata', value: duration },
        ],
      };

    case 'booking_reminder_24h':
    case 'booking_reminder_1h':
      return {
        rows: [
          { label: 'Con', value: joinRole(counterpart.displayName, counterpartRole) },
          { label: 'Tipo di sessione', value: data.serviceTitle },
          { label: 'Quando', value: sessionAt, emphasis: true },
          { label: 'Durata', value: duration },
        ],
      };

    case 'ai_report_ready':
      return {
        rows: [
          { label: 'Coach', value: data.coach.displayName },
          { label: 'Sessione del', value: sessionAt },
          { label: 'Condiviso il', value: occurredAtLabel },
        ],
      };

    case 'new_message':
      // Solo mittente e ora: il contenuto della chat è materiale di coaching e
      // non finisce in una casella di posta.
      return {
        rows: [
          { label: 'Da', value: joinRole(counterpart.displayName, counterpartRole) },
          { label: 'Ricevuto il', value: occurredAtLabel },
        ],
      };

    default:
      return { rows: [] };
  }
}

/**
 * Eventi in cui ha senso offrire "Aggiungi a Google Calendar": c'è un orario
 * confermato e l'utente sta per doverlo ricordare.
 *
 * Esclusi i promemoria: a 24 ore, e ancora di più a un'ora, l'appuntamento o è
 * già in calendario o non serve più metterlo.
 */
const CALENDAR_EVENTS = new Set([
  'booking_created_by_coach',
  'booking_accepted',
  'booking_rescheduled',
]);

/**
 * Pulsante "Aggiungi a Google Calendar" per l'email.
 *
 * Delega a `buildBookingCalendarEvent`, lo stesso costruttore usato dal
 * pulsante nell'app: titolo, descrizione, fuso e link alla videochiamata
 * restano identici ovunque, e le sue guardie valgono anche qui — niente
 * pulsante se la sessione è già passata, se manca la durata o se lo stato non
 * lo prevede.
 *
 * Restituisce null, e il pulsante sparisce, ogni volta che qualcosa non torna:
 * un'email senza pulsante resta utile, una con un pulsante rotto no.
 */
export function buildCalendarAction(input: {
  eventKey: string;
  data: BookingEmailData;
  recipientRole: 'athlete' | 'coach' | null;
}): { label: string; url: string } | null {
  if (!CALENDAR_EVENTS.has(input.eventKey)) return null;

  const { data } = input;
  const url = buildBookingGoogleCalendarUrl({
    id: data.bookingId,
    status: data.status,
    scheduledFor: data.scheduledFor,
    durationMin: data.durationMin,
    coachName: data.coach.displayName,
    athleteName: data.athlete.displayName,
    viewerRole: input.recipientRole ?? 'athlete',
    appBaseUrl: getAppBaseUrl(),
    // L'autorizzazione è già stata decisa: si arriva qui solo per un
    // destinatario che partecipa a questa prenotazione.
    canView: true,
  });

  return url ? { label: 'Aggiungi a Google Calendar', url } : null;
}

function joinRole(
  name: string | null,
  role: 'athlete' | 'coach' | null
): string | null {
  if (!name) return null;
  const label = roleLabelIt(role);
  return label ? `${name} · ${label}` : name;
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

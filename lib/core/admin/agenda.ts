import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { formatRomeDateValue } from '@/lib/core/format';
import { ageFromBirthDate, requiresGuardian } from '@/lib/core/guardians';
import { buildDaySessions, type AdminTodaySession } from './today-sessions';
import type { AdminBookingRow } from './booking-rows';
import { romeDayStart, romeDayStartShifted, romeDayValueToInstant } from './period';
import {
  UPCOMING_DAYS,
  buildUpcomingAgenda,
  type UpcomingAgenda,
} from './upcoming';

/**
 * L'agenda: che cosa c'e' in un giorno, e che cosa c'e' nei prossimi.
 *
 * Esiste perche' la Control Room guardava solo all'indietro. Il periodo
 * finiva ad `adesso` per scelta — «com'e' andata» non ha senso al futuro — e
 * la pagina Sessioni mostrava solo oggi. Risultato: **domani non era una
 * domanda che si potesse fare.**
 *
 * Legge un giorno alla volta, non tutte le prenotazioni: `getAdminBookingsOverview`
 * carica l'intera tabella per poi filtrarla in memoria, che va benissimo per
 * costruire gli elenchi per coach e sarebbe insensato per aprire una giornata.
 *
 * I conti demo restano fuori, come in tutto il resto dell'amministrazione: una
 * prenotazione e' demo se lo e' una delle due parti.
 */

/** Il predicato «nessuna delle due parti e' un conto demo». */
const REAL_PARTIES = sql`
  atleta.is_demo = false AND coach_user.is_demo = false
`;

const DAY_STATUSES = sql`('accepted', 'requested', 'completed')`;

type RawDayRow = {
  id: number;
  client_id: number;
  provider_id: number;
  status: string;
  scheduled_for: Date | string | null;
  requested_at: Date | string;
  session_started_at: Date | string | null;
  session_ended_at: Date | string | null;
  client_name: string | null;
  client_email: string;
  athlete_birth_date: string | null;
  duration_min: number | null;
  coach_name: string;
  service_title: string | null;
};

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Le sedute di un giorno di calendario a Roma.
 *
 * `day` e' `YYYY-MM-DD`. La finestra viene tradotta in istanti prima di
 * arrivare al database, cosi' il confronto resta indicizzabile: filtrare su
 * `to_char(...)` avrebbe imposto una scansione completa a ogni apertura.
 */
export async function getAdminDaySessions(
  day: string,
  now: Date = new Date()
): Promise<AdminTodaySession[]> {
  const start = romeDayValueToInstant(day) ?? romeDayStart(now);
  const end = new Date(start.getTime() + 24 * 3_600_000);
  // Le colonne di `bookings` sono `timestamp` senza fuso e contengono istanti
  // UTC: si confrontano con l'orologio UTC, non con un `timestamptz`.
  const naive = (at: Date) =>
    sql`${at.toISOString().replace('T', ' ').replace('Z', '')}::timestamp`;

  const rows = (await db.execute(sql`
    SELECT
      b.id,
      b.client_id,
      b.provider_id,
      b.status,
      b.scheduled_for,
      b.requested_at,
      b.session_started_at,
      b.session_ended_at,
      nullif(trim(concat(coalesce(atleta.name, ''), ' ', coalesce(atleta.last_name, ''))), '') AS client_name,
      atleta.email AS client_email,
      cp.birth_date AS athlete_birth_date,
      coalesce(b.duration_min, s.duration_min) AS duration_min,
      coalesce(
        nullif(trim(coach_profile.display_name), ''),
        nullif(trim(concat(coalesce(coach_user.name, ''), ' ', coalesce(coach_user.last_name, ''))), ''),
        coach_user.email
      ) AS coach_name,
      s.title AS service_title
    FROM bookings b
    JOIN users atleta ON atleta.id = b.client_id
    JOIN provider_profiles pp ON pp.id = b.provider_id
    JOIN users coach_user ON coach_user.id = pp.user_id
    LEFT JOIN profiles coach_profile ON coach_profile.user_id = pp.user_id
    LEFT JOIN client_profiles cp ON cp.user_id = b.client_id
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.scheduled_for >= ${naive(start)}
      AND b.scheduled_for < ${naive(end)}
      AND b.status IN ${DAY_STATUSES}
      AND atleta.deleted_at IS NULL
      AND ${REAL_PARTIES}
    ORDER BY b.scheduled_for
  `)) as unknown as RawDayRow[];

  /*
   * La data di nascita non esce da qui: all'amministrazione serve sapere che
   * e' un minore, non quando compie gli anni. Stessa regola di
   * `getAdminBookingRows`.
   */
  const bookingRows: AdminBookingRow[] = rows.map((row) => {
    const age = ageFromBirthDate(row.athlete_birth_date);
    return {
      id: Number(row.id),
      clientId: Number(row.client_id),
      providerId: Number(row.provider_id),
      status: row.status,
      scheduledFor: toDate(row.scheduled_for),
      requestedAt: toDate(row.requested_at) ?? now,
      sessionStartedAt: toDate(row.session_started_at),
      sessionEndedAt: toDate(row.session_ended_at),
      clientName: row.client_name,
      clientEmail: row.client_email,
      clientAvatarUrl: null,
      athleteSport: null,
      athleteLevel: null,
      athleteGoals: null,
      athleteIsMinor: requiresGuardian(age),
      athleteAge: age,
      durationMin: row.duration_min === null ? null : Number(row.duration_min),
      // Gia' risolto in SQL con un coalesce che finisce sull'email del coach:
      // non serve un ripiego qui, e il ripiego sbagliato — l'email
      // dell'atleta — mostrerebbe una persona al posto di un'altra.
      coachName: row.coach_name,
      serviceTitle: row.service_title,
    };
  });

  return buildDaySessions(bookingRows, day, now);
}

/**
 * Quante sedute ci sono nei prossimi giorni, oggi compreso.
 *
 * Conteggi e non righe: la panoramica deve dire «domani sono quattro» senza
 * caricare quattro prenotazioni con dentro nomi e profili. L'elenco si apre
 * dalla pagina Sessioni, un giorno alla volta.
 */
export async function getUpcomingAgenda(
  now: Date = new Date(),
  days: number = UPCOMING_DAYS
): Promise<UpcomingAgenda> {
  const start = romeDayStart(now);
  const end = romeDayStartShifted(now, days);
  const naive = (at: Date) =>
    sql`${at.toISOString().replace('T', ' ').replace('Z', '')}::timestamp`;

  const rows = (await db.execute(sql`
    SELECT
      to_char(((b.scheduled_for AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome')::date, 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE b.status = 'accepted')::int AS confermate,
      count(*) FILTER (WHERE b.status = 'requested')::int AS da_confermare
    FROM bookings b
    JOIN users atleta ON atleta.id = b.client_id
    JOIN provider_profiles pp ON pp.id = b.provider_id
    JOIN users coach_user ON coach_user.id = pp.user_id
    WHERE b.scheduled_for >= ${naive(start)}
      AND b.scheduled_for < ${naive(end)}
      AND b.status IN ('accepted', 'requested')
      AND atleta.deleted_at IS NULL
      AND ${REAL_PARTIES}
    GROUP BY 1
    ORDER BY 1
  `)) as unknown as {
    day: string;
    confermate: number;
    da_confermare: number;
  }[];

  return buildUpcomingAgenda(
    rows.map((row) => ({
      day: row.day,
      confermate: Number(row.confermate),
      daConfermare: Number(row.da_confermare),
    })),
    now,
    days
  );
}

/** Il giorno di calendario chiesto nell'indirizzo, o oggi. */
export function resolveAgendaDay(
  raw: string | string[] | undefined,
  now: Date = new Date()
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && romeDayValueToInstant(value)) {
    return value;
  }
  return formatRomeDateValue(now);
}

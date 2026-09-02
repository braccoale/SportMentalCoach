import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

/**
 * Gli atleti minorenni con prenotazioni attive e nessuna autorizzazione
 * confermata dal tutore.
 *
 * È l'unica voce «critica» della panoramica che non riguarda la meccanica del
 * sistema ma una persona: un minore in agenda senza una base valida non è un
 * difetto dell'interfaccia, e non si sistema riavviando un worker.
 *
 * **Senza data di nascita non si conta.** Un account senza data dichiarata
 * non è «probabilmente minorenne»: è ignoto, e contarlo qui manderebbe a
 * controllare persone maggiorenni finché nessuno guarda più il pannello. La
 * soglia dei diciotto anni è quella di `lib/core/guardians`, calcolata qui in
 * SQL sulla data del database perché il confronto avviene su migliaia di
 * righe e non ha senso portarle tutte in memoria per filtrarne tre.
 *
 * Non esce nessun nome e nessuna data di nascita: identificativo ed età.
 */
export type AthleteNeedingGuardian = {
  athleteUserId: number;
  age: number | null;
  /** `null` quando non esiste proprio una riga di tutela. */
  guardianStatus: string | null;
  activeBookings: number;
};

export async function getAthletesNeedingGuardian(): Promise<
  AthleteNeedingGuardian[]
> {
  const rows = (await db.execute(sql`
    SELECT
      b.client_id::int AS athlete_user_id,
      extract(year FROM age(current_date, cp.birth_date))::int AS age,
      max(ag.status) AS guardian_status,
      count(*)::int AS active_bookings
    FROM bookings b
    JOIN client_profiles cp ON cp.user_id = b.client_id
    LEFT JOIN athlete_guardians ag ON ag.athlete_user_id = b.client_id
    JOIN users atleta ON atleta.id = b.client_id AND atleta.is_demo = false
    JOIN provider_profiles pp ON pp.id = b.provider_id
    JOIN users coach ON coach.id = pp.user_id AND coach.is_demo = false
    WHERE b.status IN ('requested', 'accepted')
      AND cp.birth_date IS NOT NULL
      AND cp.birth_date > (current_date - INTERVAL '18 years')
      AND (ag.id IS NULL OR ag.status <> 'confirmed')
    GROUP BY 1, 2
    ORDER BY 4 DESC, 1
    LIMIT 200
  `)) as unknown as {
    athlete_user_id: number;
    age: number | null;
    guardian_status: string | null;
    active_bookings: number;
  }[];

  return rows.map((row) => ({
    athleteUserId: Number(row.athlete_user_id),
    age: row.age === null ? null : Number(row.age),
    guardianStatus: row.guardian_status,
    activeBookings: Number(row.active_bookings),
  }));
}

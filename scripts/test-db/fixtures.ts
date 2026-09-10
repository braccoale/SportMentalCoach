/**
 * Le persone e il materiale di seduta usati da entrambi gli script di
 * verifica: `policies.ts` (dominio e store) e `route-policies.ts` (rotte
 * HTTP). Estratto in un posto solo perché due copie della stessa scena
 * finiscono per divergere — è il difetto che questo repository ha già pagato
 * più volte con le regole vere, non c'è motivo di ripeterlo nei test.
 *
 * Ogni funzione qui **scrive davvero** sul database a cui `sql` è connesso.
 * Chi chiama deve avere già passato `assertTestDatabaseUrl` e il controllo del
 * marcatore — questo modulo non li ripete.
 */
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

export type Person = { id: number; authId: string };

/** I ruoli sono righe seminate, non un'enumerazione: senza, `user_roles` non accetta niente. */
export async function seedRoles(sql: postgres.Sql): Promise<void> {
  await sql`
    insert into public.roles (key, label)
    values ('athlete', 'Atleta'), ('coach', 'Coach'), ('admin', 'Admin')
    on conflict do nothing
  `;
}

export async function makeUser(
  sql: postgres.Sql,
  label: string,
  role: 'athlete' | 'coach' | 'admin',
  suffix: string
): Promise<Person> {
  const authId = randomUUID();
  await sql`insert into auth.users (id, email) values (${authId}, ${`${label}-${suffix}@test.local`})`;
  const [user] = await sql<{ id: number }[]>`
    insert into public.users (name, email, password_hash, auth_id, role)
    values (${label}, ${`${label}-${suffix}@test.local`}, 'x', ${authId}, ${role})
    returning id
  `;
  await sql`
    insert into public.user_roles (user_id, role_key)
    values (${user.id}, ${role})
    on conflict do nothing
  `;
  return { id: user.id, authId };
}

export async function makeProvider(sql: postgres.Sql, userId: number, suffix: string): Promise<number> {
  const [provider] = await sql<{ id: number }[]>`
    insert into public.provider_profiles (user_id, slug, status)
    values (${userId}, ${`p-${userId}-${suffix}`}, 'approved')
    returning id
  `;
  await sql`
    insert into public.profiles (user_id, display_name)
    values (${userId}, ${`Coach ${userId}`})
    on conflict do nothing
  `;
  return provider.id;
}

export async function makeBooking(
  sql: postgres.Sql,
  providerId: number,
  clientId: number,
  status: string,
  scheduledFor: Date | null
): Promise<number> {
  const [booking] = await sql<{ id: number }[]>`
    insert into public.bookings (client_id, provider_id, status, scheduled_for, duration_min)
    values (${clientId}, ${providerId}, ${status}, ${scheduledFor}, 40)
    returning id
  `;
  return booking.id;
}

export type CommitmentFixture = { commitmentId: number; bookingId: number; sessionId: number };

/**
 * Un'azione assegnata all'atleta, con tutto il materiale che la circonda: la
 * prenotazione svolta, gli appunti AI, il report approvato, il segmento di
 * trascrizione da cui l'evidenza dell'impegno deve necessariamente venire
 * (il vincolo `source_transcript_segment_id` lo richiede).
 */
export async function makeCommitment(
  sql: postgres.Sql,
  params: { coachUserId: number; providerId: number; athleteUserId: number; title: string }
): Promise<CommitmentFixture> {
  const bookingId = await makeBooking(
    sql,
    params.providerId,
    params.athleteUserId,
    'completed',
    new Date('2026-09-08T16:00:00Z')
  );
  const [notes] = await sql<{ id: number }[]>`
    insert into public.session_ai_notes
      (booking_id, status, requested_by, livekit_room_name)
    values (${bookingId}, 'approved', ${params.coachUserId}, ${`booking-${bookingId}`})
    returning id
  `;
  const [report] = await sql<{ id: number }[]>`
    insert into public.session_ai_reports (session_ai_notes_id, status, report_version)
    values (${notes.id}, 'approved', 1)
    returning id
  `;
  const [segment] = await sql<{ id: number }[]>`
    insert into public.session_transcript_segments
      (session_ai_notes_id, speaker_role, sequence_number, started_at_ms, ended_at_ms, text)
    values (${notes.id}, 'athlete', 1, 0, 2000, 'testo')
    returning id
  `;
  const [commitment] = await sql<{ id: number }[]>`
    insert into public.session_ai_commitments
      (session_ai_notes_id, source_report_id, source_report_version, athlete_user_id,
       coach_user_id, commitment_key, title, owner, status,
       source_transcript_segment_id, source_timestamp_ms, source_excerpt)
    values (${notes.id}, ${report.id}, 1, ${params.athleteUserId}, ${params.coachUserId},
            ${randomUUID()}, ${params.title}, 'athlete', 'pending',
            ${segment.id}, 0, 'estratto')
    returning id
  `;
  return { commitmentId: commitment.id, bookingId, sessionId: notes.id };
}

export type PilotScene = {
  coachA: Person;
  coachB: Person;
  athlete: Person;
  otherAthlete: Person;
  providerA: number;
  providerB: number;
};

/** Due coach, due atleti, due profili coach — la scena minima per ogni scenario di isolamento. */
export async function seedPilotScene(sql: postgres.Sql): Promise<PilotScene> {
  await seedRoles(sql);
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const coachA = await makeUser(sql, 'coachA', 'coach', suffix);
  const coachB = await makeUser(sql, 'coachB', 'coach', suffix);
  const athlete = await makeUser(sql, 'atleta', 'athlete', suffix);
  const otherAthlete = await makeUser(sql, 'altroAtleta', 'athlete', suffix);
  const providerA = await makeProvider(sql, coachA.id, suffix);
  const providerB = await makeProvider(sql, coachB.id, suffix);
  return { coachA, coachB, athlete, otherAthlete, providerA, providerB };
}

/** Imposta o resetta l'identità impersonata per le verifiche RLS dirette. */
export async function impersonate(sql: postgres.Sql, authId: string | null): Promise<void> {
  await sql.unsafe('RESET ROLE');
  if (authId === null) {
    await sql`select set_config('request.jwt.claim.sub', '', false)`;
    return;
  }
  await sql`select set_config('request.jwt.claim.sub', ${authId}, false)`;
  await sql.unsafe('SET ROLE authenticated');
}

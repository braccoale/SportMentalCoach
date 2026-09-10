/**
 * Le quattro identità sintetiche di questo collaudo, create per davvero in
 * Supabase Auth — locale, mai di produzione.
 *
 * **Perché un login vero e non un altro `getApiUser` sostituito.** I giri
 * precedenti hanno verificato dominio, store e rotte con l'identità
 * impersonata: rigoroso per l'autorizzazione, ma cieco su una domanda diversa
 * — un token emesso davvero da Supabase Auth, con il suo `sub`, la sua
 * scadenza, la sua firma, attraversa `getApiUser` e arriva fino a
 * `auth.uid()` nel modo in cui il codice si aspetta? Questo script crea le
 * persone; `dev-server.sh` fa girare il server che le riconosce; l'app le usa
 * per accedere per davvero.
 *
 * Quattro identità, non una in più: atleta A (il protagonista del ciclo),
 * atleta B (per l'isolamento), il coach del suo percorso, un coach estraneo
 * (per il rifiuto). Ciascuna nasce con `supabase.auth.admin.createUser`, che
 * crea l'utente già confermato — non passa da un'email vera, non ne serve
 * una.
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { abort, connectToTestDatabase } from './connect';

const ROOT = process.cwd();

type SyntheticIdentity = {
  role: 'athlete' | 'coach';
  label: string;
  email: string;
  password: string;
  authId: string;
  userId: number;
};

const PASSWORD = 'kaipai-collaudo-2026!';

async function main(): Promise<void> {
  const { sql, description } = await connectToTestDatabase();
  console.log(`\nDatabase: ${description}`);
  process.env.POSTGRES_URL = process.env.TEST_DATABASE_URL;

  const supabaseUrl = process.env.LOCAL_SUPABASE_URL;
  const serviceRoleKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Servono LOCAL_SUPABASE_URL e LOCAL_SUPABASE_SERVICE_ROLE_KEY (da `supabase status`, dentro scripts/test-db/local-supabase).'
    );
  }
  // Solo il locale: la chiave service_role è quella stampata da `supabase
  // status`, mai quella di produzione — se qualcuno la incollasse per
  // sbaglio, l'URL di un progetto gestito la respinge comunque.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(supabaseUrl)) {
    throw new Error(
      `LOCAL_SUPABASE_URL non sembra locale (${supabaseUrl}): questo script crea identità sintetiche solo su Supabase locale.`
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = Date.now().toString(36);

  await sql`
    insert into public.roles (key, label)
    values ('athlete', 'Atleta'), ('coach', 'Coach'), ('admin', 'Admin')
    on conflict do nothing
  `;

  async function createIdentity(
    role: 'athlete' | 'coach',
    label: string
  ): Promise<SyntheticIdentity> {
    const email = `${label}-${suffix}@collaudo.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { kaipai_collaudo: true, label },
    });
    if (error || !data.user) {
      throw new Error(`Creazione utente Auth fallita per ${label}: ${error?.message}`);
    }

    const [row] = await sql<{ id: number }[]>`
      insert into public.users (name, email, password_hash, auth_id, role)
      values (${label}, ${email}, 'x', ${data.user.id}, ${role})
      returning id
    `;
    await sql`
      insert into public.user_roles (user_id, role_key)
      values (${row.id}, ${role})
      on conflict do nothing
    `;

    return { role, label, email, password: PASSWORD, authId: data.user.id, userId: row.id };
  }

  console.log('\nCreazione delle quattro identità sintetiche...');
  const athleteA = await createIdentity('athlete', 'atleta-a');
  const athleteB = await createIdentity('athlete', 'atleta-b');
  const coachPercorso = await createIdentity('coach', 'coach-percorso');
  const coachEstraneo = await createIdentity('coach', 'coach-estraneo');

  for (const identity of [athleteA, athleteB, coachPercorso, coachEstraneo]) {
    console.log(`  ${identity.role.padEnd(8)} ${identity.label.padEnd(16)} user_id=${identity.userId}`);
  }

  // Il profilo coach, per entrambi i coach: serve per aprire un percorso.
  async function makeProvider(userId: number, label: string): Promise<number> {
    const [row] = await sql<{ id: number }[]>`
      insert into public.provider_profiles (user_id, slug, status)
      values (${userId}, ${`${label}-${suffix}`}, 'approved')
      returning id
    `;
    await sql`
      insert into public.profiles (user_id, display_name)
      values (${userId}, ${label})
      on conflict do nothing
    `;
    return row.id;
  }
  const providerPercorso = await makeProvider(coachPercorso.userId, 'Coach del percorso');
  await makeProvider(coachEstraneo.userId, 'Coach estraneo');

  // Il percorso: solo fra il coach del percorso e l'atleta A. Il coach
  // estraneo e l'atleta B restano fuori — è il punto del collaudo.
  const [booking] = await sql<{ id: number }[]>`
    insert into public.bookings (client_id, provider_id, status, scheduled_for, duration_min)
    values (${athleteA.userId}, ${providerPercorso}, 'accepted', null, 40)
    returning id
  `;
  const [pathRow] = await sql<{ id: number }[]>`
    insert into public.coach_athlete_paths
      (coach_user_id, athlete_user_id, status, activation_booking_id)
    values (${coachPercorso.userId}, ${athleteA.userId}, 'active', ${booking.id})
    returning id
  `;
  await sql`
    insert into public.coach_athlete_path_events (path_id, event, actor_role, actor_id, booking_id)
    values (${pathRow.id}, 'activated', 'coach', ${coachPercorso.userId}, ${booking.id})
  `;

  // L'azione da mostrare in «Oggi»: stesso materiale minimo di policies.ts.
  const [notes] = await sql<{ id: number }[]>`
    insert into public.session_ai_notes (booking_id, status, requested_by, livekit_room_name)
    values (${booking.id}, 'approved', ${coachPercorso.userId}, ${`booking-${booking.id}`})
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
    values (${notes.id}, ${report.id}, 1, ${athleteA.userId}, ${coachPercorso.userId},
            ${randomUUID()}, 'Prima della battuta, tre respiri e una parola sola: dove tiro.',
            'athlete', 'pending', ${segment.id}, 0, 'estratto')
    returning id
  `;

  console.log(`\nPercorso attivo: #${pathRow.id} (coach del percorso ↔ atleta A)`);
  console.log(`Azione assegnata: #${commitment.id}, pronta per comparire in «Oggi».`);

  const summary = {
    createdAt: new Date().toISOString(),
    password: PASSWORD,
    athleteA,
    athleteB,
    coachPercorso,
    coachEstraneo,
    pathId: pathRow.id,
    commitmentId: commitment.id,
    bookingId: booking.id,
  };
  const outFile = path.join(ROOT, 'identities.local.json');
  writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(`\nRiepilogo scritto in ${outFile} (ignorato da git, solo per questa sessione di collaudo).`);
  console.log(`Password comune per il login manuale: ${PASSWORD}`);

  await sql.end({ timeout: 5 });
}

main().catch(abort);

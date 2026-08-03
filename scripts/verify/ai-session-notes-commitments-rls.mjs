/**
 * Verifica RLS a runtime del follow-through impegni e della Mental Journey.
 *
 * Costruisce due percorsi indipendenti (coach A/atleta 1 e coach B/atleta 2)
 * dentro una transazione che viene sempre annullata, poi interroga il database
 * impersonando ciascun ruolo. Nessun dato resta scritto.
 */
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL non configurata.');
}

const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });

class VerificationRollback extends Error {}

let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

async function asUser(tx, authId) {
  await tx.unsafe('RESET ROLE');
  await tx`select set_config('request.jwt.claim.sub', ${authId}, true)`;
  await tx.unsafe('SET LOCAL ROLE authenticated');
}

async function asOwner(tx) {
  await tx.unsafe('RESET ROLE');
  await tx`select set_config('request.jwt.claim.sub', '', true)`;
}

async function expectDenied(tx, statement, label) {
  checks += 1;
  await tx.unsafe('SAVEPOINT commitments_denied_check');
  let denied = false;
  try {
    await statement();
  } catch {
    denied = true;
    await tx.unsafe('ROLLBACK TO SAVEPOINT commitments_denied_check');
  }
  await tx.unsafe('RELEASE SAVEPOINT commitments_denied_check');
  assert(denied, `${label}: l'operazione doveva essere negata`);
}

function compassDocument(sessionId) {
  return JSON.stringify({
    schemaVersion: '1.0',
    reportKind: 'session_compass_v1',
    sessionId: String(sessionId),
    sourceFingerprint: '0'.repeat(64),
    language: 'it',
    sessionOverview: {
      summary: 'Sintesi approvata di verifica.',
      summaryEvidence: [],
      themes: [],
      emergingResource: null,
    },
    keyMoments: [],
    commitments: [],
    nextSessionPrep: [],
    coachNote: null,
    generation: {
      provider: 'verify',
      model: 'verify',
      promptVersion: 'verify',
      contractVersion: '1.0',
      generatedAt: '2026-08-01T10:00:00.000Z',
    },
  });
}

async function seedPath(tx, { coach, athlete, suffix }) {
  let [provider] = await tx`
    select id from public.provider_profiles where user_id = ${coach.id}
  `;
  if (!provider) {
    [provider] = await tx`
      insert into public.provider_profiles (user_id, status)
      values (${coach.id}, 'draft') returning id
    `;
  }
  const [booking] = await tx`
    insert into public.bookings (client_id, provider_id, status, scheduled_for)
    values (${athlete.id}, ${provider.id}, 'accepted', now())
    returning id
  `;
  const [session] = await tx`
    insert into public.session_ai_notes (
      booking_id, livekit_room_name, requested_by, status, feature_code,
      metadata, createdby, updatedby
    ) values (
      ${booking.id}, ${`booking-${booking.id}`}, ${coach.id}, 'approved',
      'AI_SESSION_NOTES', '{"captureEnabled":false}'::jsonb, ${coach.id}, ${coach.id}
    ) returning id
  `;
  const [report] = await tx`
    insert into public.session_ai_reports (
      session_ai_notes_id, report_kind, report_version, status,
      generated_report_json, private_coach_notes, source_fingerprint,
      approved_by, approved_at, createdby, updatedby
    ) values (
      ${session.id}, 'session_compass_v1', 1, 'approved',
      ${compassDocument(session.id)}::jsonb,
      ${`nota privata ${suffix}`}, ${'0'.repeat(64)},
      ${coach.id}, now(), ${coach.id}, ${coach.id}
    ) returning id
  `;
  const [transcript] = await tx`
    insert into public.session_transcript_segments (
      session_ai_notes_id, speaker_role, sequence_number,
      started_at_ms, ended_at_ms, text, createdby, updatedby
    ) values (
      ${session.id}, 'athlete', 0, 0, 1000,
      ${`trascrizione riservata ${suffix}`}, ${coach.id}, ${coach.id}
    ) returning id
  `;

  async function commitment(owner, title) {
    const [row] = await tx`
      insert into public.session_ai_commitments (
        session_ai_notes_id, source_report_id, source_report_version,
        athlete_user_id, coach_user_id, commitment_key, title, owner, status,
        source_timestamp_ms, source_excerpt, createdby, updatedby
      ) values (
        ${session.id}, ${report.id}, 1, ${athlete.id}, ${coach.id},
        ${`${owner}-${suffix}-${Date.now()}-${Math.random()}`}, ${title},
        ${owner}, 'pending', 0, ${`estratto riservato ${suffix}`},
        ${coach.id}, ${coach.id}
      ) returning id
    `;
    return row;
  }

  return {
    booking,
    session,
    report,
    transcript,
    athleteCommitment: await commitment('athlete', `Impegno atleta ${suffix}`),
    coachCommitment: await commitment('coach', `Impegno coach ${suffix}`),
  };
}

try {
  await sql.begin(async (tx) => {
    const people = await tx`
      select id, auth_id from public.users
      where deleted_at is null and auth_id is not null
        and not exists (
          select 1 from public.user_roles ur
          where ur.user_id = users.id and ur.role_key = 'admin'
        )
      order by id limit 4
    `;
    assert(people.length === 4, 'Servono quattro utenti non-admin per la verifica.');
    const [coachA, athlete1, coachB, athlete2] = people;

    const [admin] = await tx`
      select u.id, u.auth_id from public.users u
      join public.user_roles ur on ur.user_id = u.id
      where ur.role_key = 'admin' and u.deleted_at is null limit 1
    `;
    assert(admin, 'Serve un utente admin.');

    const pathA = await seedPath(tx, { coach: coachA, athlete: athlete1, suffix: 'A' });
    const pathB = await seedPath(tx, { coach: coachB, athlete: athlete2, suffix: 'B' });

    // --- Caso 1: l'atleta proprietario legge solo i propri impegni assegnati.
    await asUser(tx, athlete1.auth_id);
    const own = await tx`
      select id, owner from public.session_ai_commitments
      where session_ai_notes_id = ${pathA.session.id}
    `;
    assert(
      own.length === 1 && own[0].id === pathA.athleteCommitment.id && own[0].owner === 'athlete',
      'L’atleta deve leggere soltanto gli impegni di cui è owner.'
    );

    // --- Caso 2: nessun accesso agli impegni del coach.
    const coachOwned = await tx`
      select id from public.session_ai_commitments where id = ${pathA.coachCommitment.id}
    `;
    assert(coachOwned.length === 0, 'L’atleta legge un impegno assegnato al coach.');
    await expectDenied(
      tx,
      () =>
        tx`update public.session_ai_commitments set status = 'completed'
           where id = ${pathA.athleteCommitment.id}`,
      'Update diretto del proprio impegno'
    );
    await expectDenied(
      tx,
      () =>
        tx`update public.session_ai_commitments set status = 'completed'
           where id = ${pathA.coachCommitment.id}`,
      'Update diretto di un impegno del coach'
    );
    await expectDenied(
      tx,
      () => tx`delete from public.session_ai_commitments where id = ${pathA.coachCommitment.id}`,
      'Delete diretto di un impegno del coach'
    );

    // --- Caso 3: nessun accesso a Compass, transcript e dati di altri atleti.
    const compass = await tx`
      select id from public.session_ai_reports where id = ${pathA.report.id}
    `;
    assert(compass.length === 0, 'L’atleta legge il Session Compass.');
    await expectDenied(
      tx,
      () =>
        tx`select id from public.session_transcript_segments where id = ${pathA.transcript.id}`,
      'Lettura trascrizione da parte dell’atleta'
    );
    const otherAthlete = await tx`
      select
        (select count(*)::int from public.session_ai_commitments
          where id = ${pathB.athleteCommitment.id}) as commitments,
        (select count(*)::int from public.session_ai_reports
          where id = ${pathB.report.id}) as reports,
        (select count(*)::int from public.session_ai_notes
          where id = ${pathB.session.id}) as sessions
    `;
    assert(
      otherAthlete[0].commitments === 0 &&
        otherAthlete[0].reports === 0 &&
        otherAthlete[0].sessions === 0,
      'L’atleta vede dati di un altro atleta.'
    );

    // --- Caso 4: il coach vede il proprio scope, e soltanto quello.
    await asUser(tx, coachA.auth_id);
    const coachScope = await tx`
      select id from public.session_ai_commitments
      where session_ai_notes_id in (${pathA.session.id}, ${pathB.session.id})
      order by id
    `;
    assert(
      coachScope.length === 2 &&
        coachScope.every((row) =>
          [pathA.athleteCommitment.id, pathA.coachCommitment.id].includes(row.id)
        ),
      'Il coach non vede esattamente i propri impegni di sessione.'
    );
    const coachReports = await tx`
      select id from public.session_ai_reports
      where id in (${pathA.report.id}, ${pathB.report.id})
    `;
    assert(
      coachReports.length === 1 && coachReports[0].id === pathA.report.id,
      'Il coach vede il Session Compass di un altro coach.'
    );

    // --- Caso 5: l'admin conserva l'accesso previsto.
    await asUser(tx, admin.auth_id);
    const adminView = await tx`
      select
        (select count(*)::int from public.session_ai_commitments
          where session_ai_notes_id in (${pathA.session.id}, ${pathB.session.id})) as commitments,
        (select count(*)::int from public.session_ai_reports
          where id in (${pathA.report.id}, ${pathB.report.id})) as reports
    `;
    assert(
      adminView[0].commitments === 4 && adminView[0].reports === 2,
      'L’admin non conserva l’accesso completo previsto.'
    );

    // --- Caso 6: nessuna scrittura diretta dal browser, su nessun ruolo.
    await expectDenied(
      tx,
      () =>
        tx`insert into public.session_ai_commitments (
             session_ai_notes_id, source_report_id, source_report_version,
             athlete_user_id, coach_user_id, commitment_key, title, owner,
             status, source_timestamp_ms, source_excerpt
           ) values (
             ${pathA.session.id}, ${pathA.report.id}, 1, ${athlete1.id},
             ${coachA.id}, 'bypass', 'Impegno creato dal client', 'athlete',
             'pending', 0, 'estratto'
           )`,
      'Insert impegno da ruolo browser (admin)'
    );
    await expectDenied(
      tx,
      () =>
        tx`update public.session_ai_reports set status = 'ready_for_review'
           where id = ${pathA.report.id}`,
      'Update report da ruolo browser (admin)'
    );

    await asUser(tx, athlete1.auth_id);
    await expectDenied(
      tx,
      () =>
        tx`insert into public.session_ai_reports (session_ai_notes_id)
           values (${pathA.session.id})`,
      'Insert report da ruolo browser (atleta)'
    );

    await asOwner(tx);
    const unsafeGrants = await tx`
      select role_name, table_name
      from unnest(array['anon','authenticated']) as roles(role_name)
      cross join unnest(array['session_ai_reports','session_ai_commitments'])
        as tables(table_name)
      where has_table_privilege(
        role_name, 'public.'||table_name, 'INSERT,UPDATE,DELETE,TRUNCATE'
      )
    `;
    assert(
      unsafeGrants.length === 0,
      'Un ruolo browser conserva privilegi di scrittura su report o impegni.'
    );

    throw new VerificationRollback();
  });
} catch (error) {
  if (!(error instanceof VerificationRollback)) throw error;
} finally {
  await sql.end();
}

console.log(`AI_SESSION_NOTES commitments/journey RLS verification: OK (${checks} controlli)`);

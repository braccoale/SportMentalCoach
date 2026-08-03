import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL non configurata.');
}

const sql = postgres(process.env.POSTGRES_URL, {
  prepare: false,
  max: 1,
});

class VerificationRollback extends Error {}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function asUser(tx, authId) {
  await tx.unsafe('RESET ROLE');
  await tx`select set_config('request.jwt.claim.sub', ${authId}, true)`;
  await tx.unsafe('SET LOCAL ROLE authenticated');
}

async function asRole(tx, role) {
  await tx.unsafe('RESET ROLE');
  await tx`select set_config('request.jwt.claim.sub', '', true)`;
  await tx.unsafe(`SET LOCAL ROLE ${role}`);
}

async function expectDenied(tx, statement, label) {
  await tx.unsafe('SAVEPOINT ai_notes_denied_check');
  let denied = false;
  try {
    await statement();
  } catch {
    denied = true;
    await tx.unsafe('ROLLBACK TO SAVEPOINT ai_notes_denied_check');
  }
  await tx.unsafe('RELEASE SAVEPOINT ai_notes_denied_check');
  assert(denied, `${label}: l'operazione doveva essere negata`);
}

try {
  await sql.begin(async (tx) => {
    const unsafeClientGrants = await tx`
      select role_name, table_name
      from unnest(array['anon', 'authenticated']) as roles(role_name)
      cross join unnest(array[
        'user_feature_entitlements',
        'session_ai_notes',
        'session_ai_consents',
        'session_transcript_segments',
        'session_ai_reports',
        'session_ai_commitments',
        'session_ai_audit_events',
        'session_participant_recordings',
        'session_audio_recordings',
        'session_ai_processing_jobs',
        'livekit_webhook_receipts'
      ]) as tables(table_name)
      where has_table_privilege(
        role_name,
        'public.' || table_name,
        'INSERT,UPDATE,DELETE,TRUNCATE'
      )
    `;
    assert(
      unsafeClientGrants.length === 0,
      'Un ruolo browser conserva privilegi di scrittura o TRUNCATE.'
    );
    const browserStoragePolicies = await tx`
      select policyname
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and (
          roles && array['anon', 'authenticated', 'public']::name[]
          or roles = '{public}'::name[]
        )
    `;
    assert(
      browserStoragePolicies.length === 0,
      'Una policy storage generica potrebbe esporre il bucket audio al browser.'
    );

    const participants = await tx`
      select id, auth_id
      from public.users
      where deleted_at is null
        and auth_id is not null
        and not exists (
          select 1 from public.user_roles ur
          where ur.user_id = users.id
            and ur.role_key = 'admin'
        )
      order by id
      limit 3
    `;
    assert(
      participants.length === 3,
      'Servono tre utenti non-admin per la verifica RLS.'
    );
    const [coachUser, clientUser, outsider] = participants;
    let [provider] = await tx`
      select id from public.provider_profiles where user_id = ${coachUser.id}
    `;
    if (!provider) {
      [provider] = await tx`
        insert into public.provider_profiles (user_id, status)
        values (${coachUser.id}, 'draft')
        returning id
      `;
    }
    const [bookingRow] = await tx`
      insert into public.bookings (
        client_id, provider_id, status, scheduled_for
      ) values (
        ${clientUser.id}, ${provider.id}, 'accepted', now()
      )
      returning id, client_id
    `;
    const booking = {
      ...bookingRow,
      coach_user_id: coachUser.id,
      coach_auth_id: coachUser.auth_id,
      client_auth_id: clientUser.auth_id,
    };

    const [admin] = await tx`
      select u.id, u.auth_id
      from public.users u
      join public.user_roles ur on ur.user_id = u.id
      where ur.role_key = 'admin'
        and u.deleted_at is null
      limit 1
    `;
    assert(admin, 'Serve un utente admin per verificare le policy amministrative.');

    const featureCode = `RLS_TEST_${Date.now()}`;
    const [entitlement] = await tx`
      insert into public.user_feature_entitlements (
        user_id, feature_code, status, source, createdby, updatedby
      ) values (
        ${booking.coach_user_id}, ${featureCode}, 'enabled', 'system',
        ${booking.coach_user_id}, ${booking.coach_user_id}
      )
      returning id
    `;
    const [session] = await tx`
      insert into public.session_ai_notes (
        booking_id, livekit_room_name, requested_by, status,
        feature_code, metadata, createdby, updatedby
      ) values (
        ${booking.id}, ${`booking-${booking.id}`}, ${booking.coach_user_id},
        'waiting_for_consent', 'AI_SESSION_NOTES',
        '{"captureEnabled":false}'::jsonb,
        ${booking.coach_user_id}, ${booking.coach_user_id}
      )
      returning id
    `;
    await tx`
      insert into public.session_ai_consents (
        session_ai_notes_id, user_id, participant_role, consent_status,
        consent_version, consent_text_hash, createdby, updatedby
      ) values
        (
          ${session.id}, ${booking.coach_user_id}, 'coach', 'pending',
          'rls-test', ${'0'.repeat(64)}, ${booking.coach_user_id},
          ${booking.coach_user_id}
        ),
        (
          ${session.id}, ${booking.client_id}, 'athlete', 'pending',
          'rls-test', ${'0'.repeat(64)}, ${booking.coach_user_id},
          ${booking.coach_user_id}
        )
    `;
    const [report] = await tx`
      insert into public.session_ai_reports (
        session_ai_notes_id, private_coach_notes, createdby, updatedby
      ) values (
        ${session.id}, 'rls-private-test', ${booking.coach_user_id},
        ${booking.coach_user_id}
      )
      returning id
    `;
    // Un impegno per owner: la policy deve mostrare all'atleta solo il suo.
    const [athleteCommitment] = await tx`
      insert into public.session_ai_commitments (
        session_ai_notes_id, source_report_id, source_report_version,
        athlete_user_id, coach_user_id, commitment_key, title, owner, status,
        source_transcript_segment_id, source_timestamp_ms, source_excerpt,
        createdby, updatedby
      ) values (
        ${session.id}, ${report.id}, 1, ${booking.client_id},
        ${booking.coach_user_id}, ${`athlete-${Date.now()}`},
        'Impegno atleta', 'athlete', 'pending',
        null, 120000, 'estratto riservato al coach',
        ${booking.coach_user_id}, ${booking.coach_user_id}
      )
      returning id
    `;
    const [coachCommitment] = await tx`
      insert into public.session_ai_commitments (
        session_ai_notes_id, source_report_id, source_report_version,
        athlete_user_id, coach_user_id, commitment_key, title, owner, status,
        source_transcript_segment_id, source_timestamp_ms, source_excerpt,
        createdby, updatedby
      ) values (
        ${session.id}, ${report.id}, 1, ${booking.client_id},
        ${booking.coach_user_id}, ${`coach-${Date.now()}`},
        'Impegno coach', 'coach', 'pending',
        null, 130000, 'estratto riservato al coach',
        ${booking.coach_user_id}, ${booking.coach_user_id}
      )
      returning id
    `;
    const [recording] = await tx`
      insert into public.session_audio_recordings (
        session_ai_notes_id, booking_id, participant_user_id,
        participant_role, livekit_room_name, livekit_participant_identity,
        livekit_track_sid, status, storage_bucket, storage_object_key,
        retention_until, createdby, updatedby
      ) values (
        ${session.id}, ${booking.id}, ${booking.coach_user_id},
        'coach', ${`booking-${booking.id}`}, ${`user-${booking.coach_user_id}`},
        ${`TR_RLS_${Date.now()}`}, 'starting', 'rls-private-test',
        ${`audio-recordings/${session.id}/coach/${Date.now()}.ogg`},
        now() + interval '1 day', ${booking.coach_user_id},
        ${booking.coach_user_id}
      )
      returning id
    `;
    const [participantRecording] = await tx`
      select id from public.session_participant_recordings
      where session_ai_notes_id = ${session.id}
        and participant_user_id = ${booking.coach_user_id}
    `;
    assert(participantRecording, 'Il raggruppamento logico non è stato creato.');
    const [processingJob] = await tx`
      insert into public.session_ai_processing_jobs (
        session_ai_notes_id, participant_recording_id, job_type, status,
        provider, idempotency_key, createdby, updatedby
      ) values (
        ${session.id}, ${participantRecording.id}, 'transcription', 'queued',
        'disabled', ${`RLS_JOB_${Date.now()}`}, ${booking.coach_user_id},
        ${booking.coach_user_id}
      )
      returning id
    `;
    const webhookEventId = `EV_RLS_${Date.now()}`;
    await tx`
      insert into public.livekit_webhook_receipts (
        event_id, event_type, room_name, event_created_at,
        payload_digest, status
      ) values (
        ${webhookEventId}, 'track_published', ${`booking-${booking.id}`},
        now(), ${'0'.repeat(64)}, 'processed'
      )
    `;

    await asRole(tx, 'anon');
    await expectDenied(
      tx,
      () => tx`select id from public.session_ai_notes where id = ${session.id}`,
      'Lettura anonima sessione'
    );
    await expectDenied(
      tx,
      () =>
        tx`insert into public.session_ai_notes (
          booking_id, livekit_room_name, requested_by, feature_code
        ) values (
          ${booking.id}, ${`booking-${booking.id}`},
          ${booking.coach_user_id}, 'AI_SESSION_NOTES'
        )`,
      'Creazione anonima sessione'
    );
    await expectDenied(
      tx,
      () =>
        tx`select id from public.session_audio_recordings
           where id = ${recording.id}`,
      'Lettura anonima registrazione'
    );
    await expectDenied(
      tx,
      () => tx`select id from public.session_participant_recordings
               where id = ${participantRecording.id}`,
      'Lettura anonima registrazione logica'
    );
    await expectDenied(
      tx,
      () => tx`select id from public.session_ai_processing_jobs
               where id = ${processingJob.id}`,
      'Lettura anonima job di elaborazione'
    );
    await expectDenied(
      tx,
      () =>
        tx`select event_id from public.livekit_webhook_receipts
           where event_id = ${webhookEventId}`,
      'Lettura anonima ricevute webhook'
    );

    await asRole(tx, 'service_role');
    const serviceSession = await tx`
      select id from public.session_ai_notes where id = ${session.id}
    `;
    assert(
      serviceSession.length === 1,
      'Il service_role non riesce a leggere la sessione.'
    );
    const serviceRecording = await tx`
      select id from public.session_audio_recordings where id = ${recording.id}
    `;
    const serviceLogicalRecording = await tx`
      select id from public.session_participant_recordings
      where id = ${participantRecording.id}
    `;
    const serviceJob = await tx`
      select id from public.session_ai_processing_jobs where id = ${processingJob.id}
    `;
    const serviceReceipt = await tx`
      select event_id from public.livekit_webhook_receipts
      where event_id = ${webhookEventId}
    `;
    assert(
      serviceRecording.length === 1 && serviceLogicalRecording.length === 1 &&
        serviceJob.length === 1 && serviceReceipt.length === 1,
      'Il service_role non riesce a leggere registrazioni/ricevute.'
    );
    const [transcript] = await tx`
      insert into public.session_transcript_segments (
        session_ai_notes_id, participant_user_id, speaker_role,
        sequence_number, started_at_ms, ended_at_ms, text, createdby, updatedby
      ) values (
        ${session.id}, ${booking.coach_user_id}, 'coach',
        0, 0, 1, 'service-role-test',
        ${booking.coach_user_id}, ${booking.coach_user_id}
      )
      returning id
    `;
    const [auditEvent] = await tx`
      insert into public.session_ai_audit_events (
        session_ai_notes_id, event_type, actor_user_id,
        event_metadata, createdby, updatedby
      ) values (
        ${session.id}, 'status_transitioned', ${booking.coach_user_id},
        '{"verification":true}'::jsonb,
        ${booking.coach_user_id}, ${booking.coach_user_id}
      )
      returning id
    `;

    await asUser(tx, booking.coach_auth_id);
    const ownEntitlement = await tx`
      select id from public.user_feature_entitlements
      where id = ${entitlement.id}
    `;
    assert(ownEntitlement.length === 1, 'Il coach non legge il proprio entitlement.');
    const coachSession = await tx`
      select id from public.session_ai_notes where id = ${session.id}
    `;
    assert(coachSession.length === 1, 'Il coach non legge la propria sessione.');
    const coachConsents = await tx`
      select user_id from public.session_ai_consents
      where session_ai_notes_id = ${session.id}
    `;
    assert(
      coachConsents.length === 1 &&
        coachConsents[0].user_id === booking.coach_user_id,
      'Il coach deve leggere soltanto il proprio consenso.'
    );
    const coachReport = await tx`
      select private_coach_notes
      from public.session_ai_reports
      where id = ${report.id}
    `;
    assert(coachReport.length === 1, 'Il coach non legge il proprio report.');
    const coachCommitments = await tx`
      select id from public.session_ai_commitments
      where session_ai_notes_id = ${session.id}
    `;
    assert(
      coachCommitments.length === 2,
      'Il coach non legge tutti gli impegni della propria sessione.'
    );
    await expectDenied(
      tx,
      () =>
        tx`select id from public.session_transcript_segments
           where id = ${transcript.id}`,
      'Lettura trascrizione client'
    );
    await expectDenied(
      tx,
      () =>
        tx`select id from public.session_ai_audit_events
           where id = ${auditEvent.id}`,
      'Lettura audit client'
    );
    await expectDenied(
      tx,
      () =>
        tx`select id from public.session_audio_recordings
           where id = ${recording.id}`,
      'Lettura diretta registrazione client'
    );
    await expectDenied(
      tx,
      () => tx`select id from public.session_participant_recordings
               where id = ${participantRecording.id}`,
      'Lettura registrazione logica client'
    );
    await expectDenied(
      tx,
      () => tx`select id from public.session_ai_processing_jobs
               where id = ${processingJob.id}`,
      'Lettura job di elaborazione client'
    );
    await expectDenied(
      tx,
      () =>
        tx`select event_id from public.livekit_webhook_receipts
           where event_id = ${webhookEventId}`,
      'Lettura diretta ricevuta webhook client'
    );
    await expectDenied(
      tx,
      () =>
        tx`insert into public.session_audio_recordings (
          session_ai_notes_id, booking_id, participant_user_id,
          participant_role, livekit_room_name, livekit_participant_identity,
          livekit_track_sid, storage_bucket, storage_object_key,
          retention_until
        ) values (
          ${session.id}, ${booking.id}, ${booking.coach_user_id}, 'coach',
          ${`booking-${booking.id}`}, ${`user-${booking.coach_user_id}`},
          'TR_FORBIDDEN', 'forbidden', 'forbidden.ogg', now()
        )`,
      'Inserimento diretto registrazione client'
    );
    await expectDenied(
      tx,
      () => tx`insert into public.session_ai_processing_jobs (
        session_ai_notes_id, job_type, idempotency_key
      ) values (${session.id}, 'report_generation', 'forbidden-job')`,
      'Inserimento job client'
    );
    await expectDenied(
      tx,
      () => tx`update public.session_ai_processing_jobs set status = 'cancelled'
               where id = ${processingJob.id}`,
      'Aggiornamento job client'
    );

    await expectDenied(
      tx,
      () =>
        tx`update public.user_feature_entitlements set status = 'enabled'
           where id = ${entitlement.id}`,
      'Entitlement self-service'
    );
    await expectDenied(
      tx,
      () =>
        tx`insert into public.user_feature_entitlements (
          user_id, feature_code, status, source
        ) values (
          ${booking.coach_user_id}, ${`${featureCode}_SELF`}, 'enabled', 'admin'
        )`,
      'Assegnazione entitlement client'
    );
    await expectDenied(
      tx,
      () =>
        tx`insert into public.session_ai_notes (
          booking_id, livekit_room_name, requested_by, feature_code
        ) values (
          ${booking.id}, ${`booking-${booking.id}`},
          ${booking.coach_user_id}, 'AI_SESSION_NOTES'
        )`,
      'Creazione diretta sessione client'
    );
    await expectDenied(
      tx,
      () =>
        tx`update public.session_ai_notes set status = 'active'
           where id = ${session.id}`,
      'Aggiornamento diretto stato sessione'
    );
    await expectDenied(
      tx,
      () =>
        tx`update public.session_ai_consents set consent_status = 'accepted'
           where session_ai_notes_id = ${session.id}
             and user_id = ${booking.coach_user_id}`,
      'Aggiornamento diretto consenso'
    );
    await expectDenied(
      tx,
      () =>
        tx`insert into public.session_transcript_segments (
          session_ai_notes_id, speaker_role, sequence_number,
          started_at_ms, ended_at_ms, text
        ) values (${session.id}, 'coach', 0, 0, 1, 'forbidden')`,
      'Inserimento trascrizione client'
    );
    await expectDenied(
      tx,
      () =>
        tx`insert into public.session_ai_reports (session_ai_notes_id)
           values (${session.id})`,
      'Inserimento report client'
    );

    await asUser(tx, booking.client_auth_id);
    const athleteSession = await tx`
      select id from public.session_ai_notes where id = ${session.id}
    `;
    assert(athleteSession.length === 1, 'L’atleta non legge la propria sessione.');
    const athleteEntitlement = await tx`
      select id from public.user_feature_entitlements where id = ${entitlement.id}
    `;
    assert(
      athleteEntitlement.length === 0,
      'L’atleta legge un entitlement altrui.'
    );
    const athleteReport = await tx`
      select id from public.session_ai_reports where id = ${report.id}
    `;
    assert(
      athleteReport.length === 0,
      'L’atleta può leggere le note private del coach.'
    );
    const athleteCommitments = await tx`
      select id, owner, source_excerpt
      from public.session_ai_commitments
      where session_ai_notes_id = ${session.id}
    `;
    assert(
      athleteCommitments.length === 1 &&
        athleteCommitments[0].id === athleteCommitment.id &&
        athleteCommitments[0].owner === 'athlete',
      'L’atleta deve leggere soltanto gli impegni di cui è owner.'
    );
    await expectDenied(
      tx,
      () =>
        tx`update public.session_ai_commitments
           set status = 'completed' where id = ${athleteCommitment.id}`,
      'Scrittura diretta impegno atleta'
    );
    await expectDenied(
      tx,
      () =>
        tx`delete from public.session_ai_commitments
           where id = ${coachCommitment.id}`,
      'Cancellazione diretta impegno coach'
    );
    const athleteConsents = await tx`
      select user_id from public.session_ai_consents
      where session_ai_notes_id = ${session.id}
    `;
    assert(
      athleteConsents.length === 1 &&
        athleteConsents[0].user_id === booking.client_id,
      'L’atleta deve leggere soltanto il proprio consenso.'
    );

    await asUser(tx, outsider.auth_id);
    const outsiderSessions = await tx`
      select id from public.session_ai_notes where id = ${session.id}
    `;
    assert(
      outsiderSessions.length === 0,
      'Un non partecipante può leggere una sessione altrui.'
    );

    const outsiderEntitlements = await tx`
      select id from public.user_feature_entitlements where id = ${entitlement.id}
    `;
    const outsiderConsents = await tx`
      select id from public.session_ai_consents
      where session_ai_notes_id = ${session.id}
    `;
    const outsiderReports = await tx`
      select id from public.session_ai_reports where id = ${report.id}
    `;
    const outsiderCommitments = await tx`
      select id from public.session_ai_commitments
      where session_ai_notes_id = ${session.id}
    `;
    assert(
      outsiderEntitlements.length === 0 &&
        outsiderConsents.length === 0 &&
        outsiderReports.length === 0 &&
        outsiderCommitments.length === 0,
      'Un non partecipante vede dati AI riservati.'
    );

    await asUser(tx, admin.auth_id);
    const adminRows = await tx`
      select
        (select count(*)::int from public.user_feature_entitlements
          where id = ${entitlement.id}) as entitlements,
        (select count(*)::int from public.session_ai_notes
          where id = ${session.id}) as sessions,
        (select count(*)::int from public.session_ai_reports
          where id = ${report.id}) as reports,
        (select count(*)::int from public.session_ai_commitments
          where session_ai_notes_id = ${session.id}) as commitments
    `;
    assert(
      adminRows[0].entitlements === 1 &&
        adminRows[0].sessions === 1 &&
        adminRows[0].reports === 1 &&
        adminRows[0].commitments === 2,
      'Le policy non riconoscono il ruolo admin esistente.'
    );

    await expectDenied(
      tx,
      () =>
        tx`update public.user_feature_entitlements
           set status = 'disabled' where id = ${entitlement.id}`,
      'Scrittura admin diretta dal client'
    );

    throw new VerificationRollback();
  });
} catch (error) {
  if (!(error instanceof VerificationRollback)) throw error;
} finally {
  await sql.end();
}

console.log('AI_SESSION_NOTES RLS verification: OK');

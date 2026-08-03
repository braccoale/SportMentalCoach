import assert from 'node:assert/strict';
import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL non configurata.');
const sql = postgres(process.env.POSTGRES_URL, { prepare: false, max: 1 });
class Rollback extends Error {}
let assertions = 0;
function ok(value: unknown, message: string): asserts value {
  assert.ok(value, message);
  assertions += 1;
}

async function main() {
  try {
    await sql.begin(async (tx) => {
      const users = await tx`
        select id from public.users
        where deleted_at is null
          and not exists (
            select 1 from public.user_roles
            where user_id = users.id and role_key = 'admin'
          )
        order by id limit 2
      `;
      ok(users.length === 2, 'Servono due utenti sintetici.');
      const [coach, athlete] = users;
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
        insert into public.bookings (
          client_id, provider_id, status, scheduled_for, note
        ) values (
          ${athlete.id}, ${provider.id}, 'accepted', now(),
          'PHASE_2A_SYNTHETIC_RECORDING_TEST'
        ) returning id
      `;
      const [session] = await tx`
        insert into public.session_ai_notes (
          booking_id, livekit_room_name, requested_by, status, feature_code,
          metadata, createdby, updatedby
        ) values (
          ${booking.id}, ${`booking-${booking.id}`}, ${coach.id}, 'active',
          'AI_SESSION_NOTES', '{"synthetic":true}'::jsonb,
          ${coach.id}, ${coach.id}
        ) returning id
      `;
      await tx`
        insert into public.session_ai_consents (
          session_ai_notes_id, user_id, participant_role, consent_status,
          consent_version, consent_text_hash, consented_at, createdby, updatedby
        ) values
          (${session.id}, ${coach.id}, 'coach', 'accepted', 'test',
           ${'0'.repeat(64)}, now(), ${coach.id}, ${coach.id}),
          (${session.id}, ${athlete.id}, 'athlete', 'accepted', 'test',
           ${'0'.repeat(64)}, now(), ${coach.id}, ${coach.id})
      `;
      const insertRecording = async (
        userId: number,
        role: string,
        track: string,
        suffix: string
      ) => {
        const [row] = await tx`
          insert into public.session_audio_recordings (
            session_ai_notes_id, booking_id, participant_user_id,
            participant_role, livekit_room_name,
            livekit_participant_identity, livekit_track_sid,
            status, storage_bucket, storage_object_key, retention_until,
            createdby, updatedby
          ) values (
            ${session.id}, ${booking.id}, ${userId}, ${role},
            ${`booking-${booking.id}`}, ${`user-${userId}`}, ${track},
            'starting', 'phase2a-synthetic',
            ${`audio-recordings/${session.id}/${role}/${suffix}.ogg`},
            now() + interval '7 days', ${coach.id}, ${coach.id}
          ) returning id
        `;
        return row;
      };
      const coachRecording = await insertRecording(
        coach.id,
        'coach',
        'TR_SYNTH_COACH_1',
        'coach-1'
      );
      const athleteRecording = await insertRecording(
        athlete.id,
        'athlete',
        'TR_SYNTH_ATHLETE_1',
        'athlete-1'
      );
      ok(coachRecording && athleteRecording, 'Due tracce non create.');

      await tx.unsafe('SAVEPOINT duplicate_track');
      let duplicateBlocked = false;
      try {
        await insertRecording(
          coach.id,
          'coach',
          'TR_SYNTH_COACH_1',
          'duplicate'
        );
      } catch {
        duplicateBlocked = true;
        await tx.unsafe('ROLLBACK TO SAVEPOINT duplicate_track');
      }
      await tx.unsafe('RELEASE SAVEPOINT duplicate_track');
      ok(duplicateBlocked, 'Il Track SID duplicato non è stato bloccato.');

      const republished = await insertRecording(
        coach.id,
        'coach',
        'TR_SYNTH_COACH_2',
        'coach-2'
      );
      ok(republished, 'Una nuova traccia ripubblicata non è correlabile.');

      const [started] = await tx`
        update public.session_audio_recordings
        set status = 'recording', livekit_egress_id = 'EG_SYNTH_COACH',
            started_at = now(), updatedby = ${coach.id}
        where id = ${coachRecording.id} and status = 'starting'
        returning id
      `;
      ok(started, 'Transizione starting -> recording fallita.');
      const firstStop = await tx`
        update public.session_audio_recordings
        set status = 'stopping', updatedby = ${coach.id}
        where id = ${coachRecording.id}
          and status in ('pending', 'starting', 'recording')
      `;
      const secondStop = await tx`
        update public.session_audio_recordings
        set status = 'stopping', updatedby = ${coach.id}
        where id = ${coachRecording.id}
          and status in ('pending', 'starting', 'recording')
      `;
      ok(firstStop.count === 1 && secondStop.count === 0, 'Stop non idempotente.');

      await tx`
        update public.session_audio_recordings
        set status = 'recorded', ended_at = now(), size_bytes = 128,
            checksum = 'synthetic-etag', updatedby = ${coach.id}
        where id = ${coachRecording.id}
      `;
      await tx`
        update public.session_audio_recordings
        set status = 'failed', error_code = 'EGRESS_FAILED',
            ended_at = now(), updatedby = ${coach.id}
        where id = ${athleteRecording.id}
      `;
      const mixed = await tx`
        select status from public.session_audio_recordings
        where id in (${coachRecording.id}, ${athleteRecording.id})
        order by id
      `;
      ok(
        mixed.some((row) => row.status === 'recorded') &&
          mixed.some((row) => row.status === 'failed'),
        'Il fallimento parziale di una traccia è stato nascosto.'
      );

      const eventId = `EV_SYNTH_${Date.now()}`;
      await tx`
        insert into public.livekit_webhook_receipts (
          event_id, event_type, room_name, event_created_at,
          payload_digest, status
        ) values (
          ${eventId}, 'egress_ended', ${`booking-${booking.id}`}, now(),
          ${'a'.repeat(64)}, 'processed'
        )
      `;
      const duplicateReceipt = await tx`
        insert into public.livekit_webhook_receipts (
          event_id, event_type, room_name, event_created_at,
          payload_digest, status
        ) values (
          ${eventId}, 'egress_ended', ${`booking-${booking.id}`}, now(),
          ${'a'.repeat(64)}, 'processed'
        ) on conflict (event_id) do nothing
      `;
      ok(duplicateReceipt.count === 0, 'Webhook duplicato non idempotente.');

      await tx`
        update public.session_audio_recordings
        set retention_until = now() - interval '1 minute'
        where id = ${coachRecording.id}
      `;
      const expired = await tx`
        select id from public.session_audio_recordings
        where retention_until <= now() and deleted_at is null
          and status not in ('pending','starting','recording','stopping','deleted')
          and id = ${coachRecording.id}
      `;
      ok(expired.length === 1, 'La retention non individua il file scaduto.');
      await tx`
        update public.session_audio_recordings
        set status = 'deleted', deleted_at = now(),
            deletion_attempts = deletion_attempts + 1
        where id = ${coachRecording.id}
      `;
      const [deleted] = await tx`
        select status, deleted_at, deletion_attempts
        from public.session_audio_recordings where id = ${coachRecording.id}
      `;
      ok(
        deleted.status === 'deleted' &&
          deleted.deleted_at &&
          deleted.deletion_attempts === 1,
        'Cancellazione verificata non rappresentabile.'
      );

      await tx`
        insert into public.session_ai_audit_events (
          session_ai_notes_id, event_type, actor_user_id,
          event_metadata, createdby, updatedby
        ) values
          (${session.id}, 'recording_started', ${coach.id},
           '{"synthetic":true}', ${coach.id}, ${coach.id}),
          (${session.id}, 'recording_failed', ${coach.id},
           '{"synthetic":true}', ${coach.id}, ${coach.id}),
          (${session.id}, 'recording_deleted', ${coach.id},
           '{"synthetic":true}', ${coach.id}, ${coach.id})
      `;
      const audits = await tx`
        select count(*)::int as count from public.session_ai_audit_events
        where session_ai_notes_id = ${session.id}
      `;
      ok(audits[0].count === 3, 'Audit lifecycle incompleto.');

      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  } finally {
    await sql.end();
  }
  console.log(
    `AI_SESSION_NOTES recording flow verification: OK (${assertions} assertions)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


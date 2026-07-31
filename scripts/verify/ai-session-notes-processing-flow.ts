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
      const users = await tx`select id from public.users where deleted_at is null order by id limit 2`;
      ok(users.length === 2, 'Servono due utenti per il test sintetico.');
      const [coach, athlete] = users;
      let [provider] = await tx`select id from public.provider_profiles where user_id = ${coach.id}`;
      if (!provider) [provider] = await tx`insert into public.provider_profiles (user_id, status) values (${coach.id}, 'draft') returning id`;
      const [booking] = await tx`insert into public.bookings (client_id, provider_id, status, scheduled_for, note) values (${athlete.id}, ${provider.id}, 'accepted', now(), 'PHASE_2B_SYNTHETIC_PROCESSING_TEST') returning id`;
      const [session] = await tx`insert into public.session_ai_notes (booking_id, livekit_room_name, requested_by, status, feature_code, metadata, createdby, updatedby) values (${booking.id}, ${`booking-${booking.id}`}, ${coach.id}, 'active', 'AI_SESSION_NOTES', '{"synthetic":true}'::jsonb, ${coach.id}, ${coach.id}) returning id`;
      await tx`insert into public.session_ai_consents (session_ai_notes_id, user_id, participant_role, consent_status, consent_version, consent_text_hash, consented_at, createdby, updatedby) values (${session.id}, ${coach.id}, 'coach', 'accepted', 'test', ${'0'.repeat(64)}, now(), ${coach.id}, ${coach.id}), (${session.id}, ${athlete.id}, 'athlete', 'accepted', 'test', ${'0'.repeat(64)}, now(), ${coach.id}, ${coach.id})`;
      const insertSegment = (track: string, offset: number) => tx`insert into public.session_audio_recordings (session_ai_notes_id, booking_id, participant_user_id, participant_role, livekit_room_name, livekit_participant_identity, livekit_track_sid, status, started_at, ended_at, duration_seconds, storage_bucket, storage_object_key, retention_until, createdby, updatedby) values (${session.id}, ${booking.id}, ${coach.id}, 'coach', ${`booking-${booking.id}`}, ${`user-${coach.id}`}, ${track}, 'recorded', now() + ${`${offset} seconds`}::interval, now() + ${`${offset + 10} seconds`}::interval, 10, 'synthetic', ${`${track}.ogg`}, now() + interval '1 day', ${coach.id}, ${coach.id}) returning id, participant_recording_id, segment_order`;
      const [first] = await insertSegment('TR_PROCESSING_1', 0);
      const [second] = await insertSegment('TR_PROCESSING_2', 20);
      ok(first.participant_recording_id === second.participant_recording_id, 'Le tracce dello stesso partecipante non sono raggruppate.');
      ok(first.segment_order === 0 && second.segment_order === 1, 'L’ordine dei segmenti non è deterministico.');
      const [logical] = await tx`select segment_count, aggregate_duration_seconds, status from public.session_participant_recordings where id = ${first.participant_recording_id}`;
      ok(logical.segment_count === 2 && logical.aggregate_duration_seconds === 20 && logical.status === 'recorded', 'Gli aggregati della registrazione logica sono errati.');
      const key = `PROCESSING_TEST_${Date.now()}`;
      const [job] = await tx`insert into public.session_ai_processing_jobs (session_ai_notes_id, participant_recording_id, job_type, provider, idempotency_key, createdby, updatedby) values (${session.id}, ${first.participant_recording_id}, 'transcription', 'disabled', ${key}, ${coach.id}, ${coach.id}) returning id`;
      const duplicate = await tx`insert into public.session_ai_processing_jobs (session_ai_notes_id, participant_recording_id, job_type, provider, idempotency_key, createdby, updatedby) values (${session.id}, ${first.participant_recording_id}, 'transcription', 'disabled', ${key}, ${coach.id}, ${coach.id}) on conflict (idempotency_key) do nothing`;
      ok(duplicate.count === 0, 'L’enqueue idempotente ha creato un duplicato.');
      const claim = (worker: string) => tx`with candidate as (select j.id from public.session_ai_processing_jobs j where j.id = ${job.id} and j.status = 'queued' and j.available_after <= now() for update skip locked) update public.session_ai_processing_jobs j set status = 'processing', attempt_count = attempt_count + 1, locked_at = now(), locked_by = ${worker}, started_at = now() from candidate where j.id = candidate.id returning j.id`;
      const firstClaim = await claim('worker-one');
      const secondClaim = await claim('worker-two');
      ok(firstClaim.length === 1 && secondClaim.length === 0, 'Due worker hanno ottenuto lo stesso job.');
      await tx`update public.session_ai_processing_jobs set status = 'queued', available_after = now(), locked_at = null, locked_by = null, error_code = 'TEMPORARY', error_message_sanitized = 'retry', updatedby = ${coach.id} where id = ${job.id} and attempt_count < max_attempts`;
      const [retry] = await tx`select status, attempt_count, error_code from public.session_ai_processing_jobs where id = ${job.id}`;
      ok(retry.status === 'queued' && retry.attempt_count === 1 && retry.error_code === 'TEMPORARY', 'Il retry non conserva stato e tentativo.');
      await tx`update public.session_ai_processing_jobs set status = 'processing', attempt_count = max_attempts, locked_at = now() - interval '1 hour', locked_by = 'stale-worker' where id = ${job.id}`;
      await tx`update public.session_ai_processing_jobs set status = 'failed', completed_at = now(), error_code = 'MAX_ATTEMPTS_REACHED', error_message_sanitized = 'maximum attempts reached' where id = ${job.id} and status = 'processing' and locked_at < now() - interval '5 minutes' and attempt_count >= max_attempts`;
      const [failed] = await tx`select status, error_code from public.session_ai_processing_jobs where id = ${job.id}`;
      ok(failed.status === 'failed' && failed.error_code === 'MAX_ATTEMPTS_REACHED', 'Il recupero stale/max-attempt non fallisce il job.');
      const [cancelJob] = await tx`insert into public.session_ai_processing_jobs (session_ai_notes_id, job_type, provider, idempotency_key, createdby, updatedby) values (${session.id}, 'report_generation', 'disabled', ${`${key}_cancel`}, ${coach.id}, ${coach.id}) returning id`;
      await tx`update public.session_ai_processing_jobs set status = 'cancelled', cancelled_at = now(), error_code = 'SESSION_CANCELLED', error_message_sanitized = 'session cancelled' where id = ${cancelJob.id} and status in ('queued', 'processing')`;
      const [cancelled] = await tx`select status from public.session_ai_processing_jobs where id = ${cancelJob.id}`;
      ok(cancelled.status === 'cancelled', 'La cancellazione del job non è persistita.');
      const [transcript] = await tx`insert into public.session_transcript_segments (session_ai_notes_id, participant_user_id, speaker_role, participant_recording_id, physical_recording_id, sequence_number, started_at_ms, ended_at_ms, text, normalization_status, createdby, updatedby) values (${session.id}, ${coach.id}, 'coach', ${first.participant_recording_id}, ${first.id}, 0, 0, 1000, 'placeholder', 'pending', ${coach.id}, ${coach.id}) returning id`;
      ok(Boolean(transcript), 'Il placeholder transcript non accetta i riferimenti fisico/logico.');
      throw new Rollback();
    });
  } catch (error) { if (!(error instanceof Rollback)) throw error; } finally { await sql.end(); }
  console.log(`AI_SESSION_NOTES processing flow verification: OK (${assertions} assertions)`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

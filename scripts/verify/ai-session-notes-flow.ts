import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import postgres from 'postgres';
import {
  canActorAnswerConsent,
  canApplyConsentDecision,
  isConsentDecisionIdempotent,
  nextStatusAfterConsent,
  type ConsentDecision,
} from '../../lib/core/ai-session-notes/consent-policy';
import {
  assertAiNotesTransition,
} from '../../lib/core/ai-session-notes/state-machine';
import {
  evaluateFeatureEntitlement,
} from '../../lib/core/features/policy';
import type {
  AiConsentStatus,
  AiSessionNoteStatus,
  FeatureEntitlementSource,
  FeatureEntitlementStatus,
} from '../../lib/db/schema';

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

let assertions = 0;

function verified(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  assertions += 1;
}

async function main() {
  try {
    await sql.begin(async (tx) => {
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
    verified(
      participants.length === 3,
      'Servono tre utenti non-admin per il test del consenso.'
    );
    const [coach, athlete, outsider] = participants;

    let [provider] = await tx`
      select id from public.provider_profiles where user_id = ${coach.id}
    `;
    if (!provider) {
      [provider] = await tx`
        insert into public.provider_profiles (user_id, status)
        values (${coach.id}, 'draft')
        returning id
      `;
    }

    await tx`
      insert into public.user_feature_entitlements (
        user_id, feature_code, status, source, starts_at,
        usage_count, createdby, updatedby
      ) values (
        ${coach.id}, 'AI_SESSION_NOTES', 'enabled', 'system', now(),
        0, ${coach.id}, ${coach.id}
      )
      on conflict (user_id, feature_code) do update set
        status = 'enabled',
        source = 'system',
        starts_at = now(),
        expires_at = null,
        usage_limit = null,
        usage_count = 0,
        updatedby = ${coach.id}
    `;

    async function createBooking() {
      const [booking] = await tx`
        insert into public.bookings (
          client_id, provider_id, status, scheduled_for, note
        ) values (
          ${athlete.id}, ${provider.id}, 'accepted', null,
          'AI_SESSION_NOTES_FLOW_TEST'
        )
        returning id
      `;
      return booking.id as number;
    }

    async function startSession(bookingId: number, actorUserId: number) {
      const [booking] = await tx`
        select b.client_id, pp.user_id as coach_user_id
        from public.bookings b
        join public.provider_profiles pp on pp.id = b.provider_id
        where b.id = ${bookingId}
          and b.status = 'accepted'
      `;
      verified(booking, 'Il booking di verifica non è disponibile.');
      verified(
        actorUserId === booking.coach_user_id,
        'Soltanto il coach può avviare Appunti AI.'
      );
      const [entitlement] = await tx`
        select id, status, source, starts_at, expires_at,
               usage_limit, usage_count
        from public.user_feature_entitlements
        where user_id = ${actorUserId}
          and feature_code = 'AI_SESSION_NOTES'
        for update
      `;
      const access = evaluateFeatureEntitlement(
        entitlement
          ? {
              id: entitlement.id,
              status: entitlement.status as FeatureEntitlementStatus,
              source: entitlement.source as FeatureEntitlementSource,
              startsAt: entitlement.starts_at,
              expiresAt: entitlement.expires_at,
              usageLimit: entitlement.usage_limit,
              usageCount: entitlement.usage_count,
            }
          : null
      );
      verified(access.allowed, 'Il coach di verifica non ha entitlement valido.');

      const [session] = await tx`
        insert into public.session_ai_notes (
          booking_id, livekit_room_name, requested_by, status,
          feature_code, metadata, createdby, updatedby
        ) values (
          ${bookingId}, ${`booking-${bookingId}`}, ${actorUserId},
          'waiting_for_consent', 'AI_SESSION_NOTES',
          '{"captureEnabled":false,"phase":1,"verification":true}'::jsonb,
          ${actorUserId}, ${actorUserId}
        )
        returning id, status
      `;
      await tx`
        insert into public.session_ai_consents (
          session_ai_notes_id, user_id, participant_role, consent_status,
          consent_version, consent_text_hash, createdby, updatedby
        ) values
          (
            ${session.id}, ${coach.id}, 'coach', 'pending',
            'flow-test', ${'0'.repeat(64)}, ${coach.id}, ${coach.id}
          ),
          (
            ${session.id}, ${athlete.id}, 'athlete', 'pending',
            'flow-test', ${'0'.repeat(64)}, ${coach.id}, ${coach.id}
          )
      `;
      await tx`
        update public.user_feature_entitlements
        set usage_count = usage_count + 1, updatedby = ${actorUserId}
        where id = ${entitlement.id}
      `;
      return session.id as number;
    }

    async function state(sessionId: number) {
      const [session] = await tx`
        select status from public.session_ai_notes where id = ${sessionId}
      `;
      const consents = await tx`
        select user_id, consent_status, updateddate
        from public.session_ai_consents
        where session_ai_notes_id = ${sessionId}
        order by user_id
      `;
      return {
        status: session.status as AiSessionNoteStatus,
        consents,
      };
    }

    async function decide(
      sessionId: number,
      actorUserId: number,
      decision: ConsentDecision
    ) {
      const [session] = await tx`
        select san.id, san.status, b.client_id, pp.user_id as coach_user_id
        from public.session_ai_notes san
        join public.bookings b on b.id = san.booking_id
        join public.provider_profiles pp on pp.id = b.provider_id
        where san.id = ${sessionId}
        for update of san
      `;
      verified(session, 'Sessione di verifica non trovata.');
      const [consent] = await tx`
        select id, user_id, consent_status, updateddate
        from public.session_ai_consents
        where session_ai_notes_id = ${sessionId}
          and user_id = ${actorUserId}
      `;
      if (!consent) throw new Error('NOT_PARTICIPANT');
      verified(
        canActorAnswerConsent({
          actorUserId,
          consentUserId: consent.user_id,
          clientUserId: session.client_id,
          coachUserId: session.coach_user_id,
        }),
        'Un attore non autorizzato può rispondere al consenso.'
      );
      if (
        isConsentDecisionIdempotent(
          consent.consent_status as AiConsentStatus,
          decision
        )
      ) {
        return { idempotent: true, updatedDate: consent.updateddate as Date };
      }
      verified(
        canApplyConsentDecision(
          consent.consent_status as AiConsentStatus,
          decision
        ),
        'Decisione di consenso non valida.'
      );
      await tx`
        update public.session_ai_consents
        set
          consent_status = ${decision},
          consented_at = case
            when ${decision} in ('accepted', 'rejected') then now()
            else null
          end,
          revoked_at = case when ${decision} = 'revoked' then now() else null end,
          updatedby = ${actorUserId}
        where id = ${consent.id}
      `;
      const statuses = await tx`
        select consent_status
        from public.session_ai_consents
        where session_ai_notes_id = ${sessionId}
      `;
      const nextStatus = nextStatusAfterConsent({
        sessionStatus: session.status as AiSessionNoteStatus,
        decision,
        allConsentStatuses: statuses.map(
          (row) => row.consent_status as AiConsentStatus
        ),
      });
      if (nextStatus) {
        assertAiNotesTransition(
          session.status as AiSessionNoteStatus,
          nextStatus
        );
        await tx`
          update public.session_ai_notes
          set
            status = ${nextStatus},
            started_at = case when ${nextStatus} = 'active' then now() else started_at end,
            ended_at = case
              when ${nextStatus} in ('cancelled', 'consent_rejected') then now()
              else ended_at
            end,
            updatedby = ${actorUserId}
          where id = ${sessionId}
        `;
      }
      const [updated] = await tx`
        select updateddate
        from public.session_ai_consents
        where id = ${consent.id}
      `;
      return { idempotent: false, updatedDate: updated.updateddate as Date };
    }

    const activeBookingId = await createBooking();
    const activeSessionId = await startSession(activeBookingId, coach.id);
    let snapshot = await state(activeSessionId);
    verified(
      snapshot.status === 'waiting_for_consent',
      'La sessione non parte in waiting_for_consent.'
    );

    const firstCoachDecision = await decide(
      activeSessionId,
      coach.id,
      'accepted'
    );
    snapshot = await state(activeSessionId);
    verified(
      snapshot.status === 'waiting_for_consent',
      'Il primo consenso ha attivato prematuramente la sessione.'
    );
    verified(
      snapshot.consents.some(
        (row) =>
          row.user_id === athlete.id && row.consent_status === 'pending'
      ),
      'Il consenso atleta non è rimasto pending.'
    );
    const duplicateCoachDecision = await decide(
      activeSessionId,
      coach.id,
      'accepted'
    );
    verified(
      duplicateCoachDecision.idempotent &&
        duplicateCoachDecision.updatedDate.getTime() ===
          firstCoachDecision.updatedDate.getTime(),
      'La ripetizione del consenso coach non è idempotente.'
    );

    await assert.rejects(
      () => decide(activeSessionId, outsider.id, 'accepted'),
      /NOT_PARTICIPANT/
    );
    assertions += 1;

    await decide(activeSessionId, athlete.id, 'accepted');
    snapshot = await state(activeSessionId);
    verified(
      snapshot.status === 'active',
      'Due consensi non attivano la sessione.'
    );
    const duplicateAthleteDecision = await decide(
      activeSessionId,
      athlete.id,
      'accepted'
    );
    verified(
      duplicateAthleteDecision.idempotent,
      'La ripetizione del consenso atleta non è idempotente.'
    );

    await decide(activeSessionId, coach.id, 'revoked');
    snapshot = await state(activeSessionId);
    verified(
      snapshot.status === 'cancelled',
      'La revoca durante active non cancella in sicurezza la sessione.'
    );
    const duplicateRevocation = await decide(
      activeSessionId,
      coach.id,
      'revoked'
    );
    verified(
      duplicateRevocation.idempotent,
      'La ripetizione della revoca non è idempotente.'
    );

    const rejectedBookingId = await createBooking();
    const rejectedSessionId = await startSession(rejectedBookingId, coach.id);
    await decide(rejectedSessionId, coach.id, 'accepted');
    await decide(rejectedSessionId, athlete.id, 'rejected');
    const rejected = await state(rejectedSessionId);
    verified(
      rejected.status === 'consent_rejected',
      'Il rifiuto non porta a consent_rejected.'
    );
    const duplicateRejection = await decide(
      rejectedSessionId,
      athlete.id,
      'rejected'
    );
    verified(
      duplicateRejection.idempotent,
      'La ripetizione del rifiuto non è idempotente.'
    );

      throw new VerificationRollback();
    });
  } catch (error) {
    if (!(error instanceof VerificationRollback)) throw error;
  } finally {
    await sql.end();
  }

  console.log(
    `AI_SESSION_NOTES consent flow verification: OK (${assertions} assertions)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

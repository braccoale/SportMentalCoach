import 'server-only';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  agreementAcceptances,
  athleteGuardians,
  clientProfiles,
  guardianAuthorizationEvents,
  guardianInvitations,
  users,
} from '@/lib/db/schema';
import { sendNotificationEmail, type SendResult } from '@/lib/core/email';
import type { Result } from '@/lib/core/result';
import { ageFromBirthDate, requiresGuardian } from './age';
import {
  authorityMatchesRelationship,
  hasActiveGuardianAuthorization,
  isAuthorityBasis,
  isGuardianRelationship,
  normalizeSignatureName,
  signatureMatchesInvite,
  type AuthorityBasis,
} from './policy';
import {
  GUARDIAN_CONSENT_HASH,
  GUARDIAN_CONSENT_TEXT,
  GUARDIAN_CONSENT_VERSION,
} from './consent-document';
import { hashGuardianToken, issueGuardianToken } from './tokens';

export * from './age';
export * from './consent-document';
export * from './policy';
export * from './revocation';
export * from './tokens';

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const INVITATION_COOLDOWN_MS = 60 * 1000;

function deliveryState(result: SendResult): {
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
} {
  if (result.ok) return { status: 'sent', error: null };
  if (result.skipped) return { status: 'skipped', error: result.reason };
  return { status: 'failed', error: result.error };
}

export type GuardianStatus =
  | { kind: 'not_required' }
  | { kind: 'missing'; age: number }
  | {
      kind: 'pending';
      age: number;
      guardianName: string;
      guardianEmail: string;
    }
  | {
      kind: 'confirmed';
      age: number;
      guardianName: string;
      aiRecordingAuthorized: boolean;
    }
  | { kind: 'revoked'; age: number; guardianName: string }
  | { kind: 'unknown_age' };

export async function getGuardianStatus(
  athleteUserId: number,
  executor: DbOrTx = db
): Promise<GuardianStatus> {
  const [profile] = await executor
    .select({ birthDate: clientProfiles.birthDate })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, athleteUserId))
    .limit(1);

  const age = ageFromBirthDate(profile?.birthDate ?? null);
  if (age == null) return { kind: 'unknown_age' };
  if (!requiresGuardian(age)) return { kind: 'not_required' };

  const [guardian] = await executor
    .select({
      guardianName: athleteGuardians.guardianName,
      guardianEmail: athleteGuardians.guardianEmail,
      status: athleteGuardians.status,
      confirmedAt: athleteGuardians.confirmedAt,
      revokedAt: athleteGuardians.revokedAt,
      activeAcceptanceId: athleteGuardians.activeAcceptanceId,
      aiRecordingAuthorized: athleteGuardians.aiRecordingAuthorized,
    })
    .from(athleteGuardians)
    .where(eq(athleteGuardians.athleteUserId, athleteUserId))
    .limit(1);

  if (!guardian) return { kind: 'missing', age };
  if (guardian.status === 'revoked' || guardian.revokedAt) {
    return { kind: 'revoked', age, guardianName: guardian.guardianName };
  }
  if (!hasActiveGuardianAuthorization(guardian)) {
    return {
      kind: 'pending',
      age,
      guardianName: guardian.guardianName,
      guardianEmail: guardian.guardianEmail,
    };
  }
  return {
    kind: 'confirmed',
    age,
    guardianName: guardian.guardianName,
    aiRecordingAuthorized: guardian.aiRecordingAuthorized,
  };
}

export async function canBookSessions(
  athleteUserId: number,
  executor: DbOrTx = db
): Promise<Result> {
  const status = await getGuardianStatus(athleteUserId, executor);
  switch (status.kind) {
    case 'not_required':
    case 'confirmed':
      return { ok: true };
    case 'unknown_age':
      return {
        ok: false,
        error:
          'Per prenotare una sessione indica la tua data di nascita nel profilo.',
      };
    case 'missing':
      return {
        ok: false,
        error:
          'Hai meno di 18 anni: per prenotare serve l’autorizzazione di un genitore o tutore.',
      };
    case 'pending':
      return {
        ok: false,
        error: `Stiamo aspettando la conferma di ${status.guardianName}.`,
      };
    case 'revoked':
      return {
        ok: false,
        error:
          'L’autorizzazione del genitore o tutore è stata revocata. Per riprendere il percorso serve una nuova autorizzazione.',
      };
  }
}

/** Fresh session-entry check used by bookings, video tokens and guest links. */
export const canParticipateInSessions = canBookSessions;

/** Separate prerequisite for recording/transcription when the athlete is 15-17. */
export async function canUseAiNotesForAthlete(
  athleteUserId: number,
  executor: DbOrTx = db
): Promise<Result> {
  const status = await getGuardianStatus(athleteUserId, executor);
  if (status.kind === 'not_required') return { ok: true };
  if (status.kind !== 'confirmed') {
    return {
      ok: false,
      error:
        'Appunti AI non disponibile: manca un’autorizzazione valida del genitore o tutore.',
    };
  }
  return status.aiRecordingAuthorized
    ? { ok: true }
    : {
        ok: false,
        error:
          'Il genitore o tutore ha autorizzato le sessioni, ma non la registrazione e trascrizione per Appunti AI.',
      };
}

export type InviteGuardianResult = {
  alreadyConfirmed: boolean;
  emailSent: boolean;
};

export async function inviteGuardian(params: {
  athleteUserId: number;
  guardianName: string;
  guardianEmail: string;
  relationship?: string | null;
}): Promise<Result<InviteGuardianResult>> {
  const status = await getGuardianStatus(params.athleteUserId);
  if (status.kind === 'not_required') {
    return { ok: false, error: 'Non ti serve l’autorizzazione di un tutore.' };
  }
  if (status.kind === 'unknown_age') {
    return { ok: false, error: 'Indica prima la tua data di nascita.' };
  }
  if (status.kind === 'confirmed') {
    return { ok: true, alreadyConfirmed: true, emailSent: false };
  }

  const name = normalizeSignatureName(params.guardianName);
  const email = params.guardianEmail.trim().toLowerCase();
  const relationship = (params.relationship ?? '').trim();
  if (name.length < 3 || name.length > 200) {
    return { ok: false, error: 'Indica nome e cognome completi del tutore.' };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'Indirizzo email non valido.' };
  }
  if (!isGuardianRelationship(relationship)) {
    return { ok: false, error: 'Indica il rapporto con l’atleta.' };
  }

  const [athlete] = await db
    .select({ email: users.email, name: users.name, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, params.athleteUserId))
    .limit(1);
  if (!athlete) return { ok: false, error: 'Atleta non trovato.' };
  if (email === athlete.email.trim().toLowerCase()) {
    return { ok: false, error: 'L’email del tutore deve essere diversa dalla tua.' };
  }

  const [latest] = await db
    .select({ createdAt: guardianInvitations.createdAt })
    .from(guardianInvitations)
    .where(eq(guardianInvitations.athleteUserId, params.athleteUserId))
    .orderBy(desc(guardianInvitations.createdAt))
    .limit(1);
  if (
    latest &&
    Date.now() - latest.createdAt.getTime() < INVITATION_COOLDOWN_MS
  ) {
    return {
      ok: false,
      error: 'Attendi un minuto prima di inviare nuovamente la richiesta.',
    };
  }

  const rawToken = issueGuardianToken();
  const tokenHash = hashGuardianToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

  const invitation = await db.transaction(async (tx) => {
    const [guardian] = await tx
      .insert(athleteGuardians)
      .values({
        athleteUserId: params.athleteUserId,
        guardianName: name,
        guardianEmail: email,
        relationship,
        status: 'pending',
        createdBy: params.athleteUserId,
      })
      .onConflictDoUpdate({
        target: athleteGuardians.athleteUserId,
        set: {
          guardianName: name,
          guardianEmail: email,
          relationship,
          status: 'pending',
          confirmedAt: null,
          confirmedIp: null,
          confirmedUserAgent: null,
          signatureName: null,
          authorityBasis: null,
          bothParentsDeclared: false,
          aiRecordingAuthorized: false,
          activeAcceptanceId: null,
          managementTokenHash: null,
          revokedAt: null,
          revokedReason: null,
          updatedAt: now,
          updatedBy: params.athleteUserId,
        },
      })
      .returning({ id: athleteGuardians.id });

    await tx
      .update(guardianInvitations)
      .set({ invalidatedAt: now, updatedBy: params.athleteUserId })
      .where(
        and(
          eq(guardianInvitations.athleteGuardianId, guardian.id),
          isNull(guardianInvitations.consumedAt),
          isNull(guardianInvitations.invalidatedAt)
        )
      );

    const [created] = await tx
      .insert(guardianInvitations)
      .values({
        athleteGuardianId: guardian.id,
        athleteUserId: params.athleteUserId,
        guardianName: name,
        guardianEmail: email,
        relationship,
        tokenHash,
        expiresAt,
        createdBy: params.athleteUserId,
        updatedBy: params.athleteUserId,
      })
      .returning({ id: guardianInvitations.id });

    await tx.insert(guardianAuthorizationEvents).values({
      athleteUserId: params.athleteUserId,
      athleteGuardianId: guardian.id,
      invitationId: created.id,
      eventType: 'invitation_created',
      actorType: 'athlete',
      actorUserId: params.athleteUserId,
      eventMetadata: { expiresAt: expiresAt.toISOString() },
    });
    return { id: created.id, guardianId: guardian.id };
  });

  const athleteName = [athlete.name, athlete.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Un giovane atleta';
  const sendResult = await sendNotificationEmail({
    to: email,
    title: `Autorizzazione richiesta per ${athleteName}`,
    body:
      `Ciao ${name},\n\n${athleteName} ti ha indicato come genitore o tutore su KaiPai. ` +
      'Apri il collegamento personale, leggi il documento e firma digitando il tuo nome completo. ' +
      'Il collegamento è monouso e scade dopo 72 ore. Se non riconosci la richiesta, ignorala e avvisa KaiPai.',
    link: `/tutore/conferma?token=${encodeURIComponent(rawToken)}`,
    actionLabel: 'Verifica e autorizza',
  });
  const delivery = deliveryState(sendResult);

  await db.transaction(async (tx) => {
    await tx
      .update(guardianInvitations)
      .set({
        deliveryStatus: delivery.status,
        deliveryError: delivery.error?.slice(0, 1000) ?? null,
        sentAt: delivery.status === 'sent' ? new Date() : null,
        updatedBy: params.athleteUserId,
      })
      .where(eq(guardianInvitations.id, invitation.id));
    await tx.insert(guardianAuthorizationEvents).values({
      athleteUserId: params.athleteUserId,
      athleteGuardianId: invitation.guardianId,
      invitationId: invitation.id,
      eventType:
        delivery.status === 'sent' ? 'invitation_sent' : 'invitation_failed',
      actorType: 'system',
      eventMetadata: {
        deliveryStatus: delivery.status,
        ...(delivery.error ? { error: delivery.error.slice(0, 500) } : {}),
      },
    });
  });

  if (delivery.status !== 'sent') {
    return {
      ok: false,
      error:
        'La richiesta è stata preparata ma l’email non è partita. Verifica la configurazione del mittente e riprova.',
    };
  }
  return { ok: true, alreadyConfirmed: false, emailSent: true };
}

export type GuardianInvitation = {
  athleteName: string;
  guardianName: string;
  relationship: string;
  alreadyConfirmed: boolean;
  expiresAt: Date;
};

export async function getInvitationByToken(
  token: string
): Promise<GuardianInvitation | null> {
  if (!token || token.length > 256) return null;
  const tokenHash = hashGuardianToken(token);
  const [row] = await db
    .select({
      guardianName: guardianInvitations.guardianName,
      relationship: guardianInvitations.relationship,
      expiresAt: guardianInvitations.expiresAt,
      consumedAt: guardianInvitations.consumedAt,
      invalidatedAt: guardianInvitations.invalidatedAt,
      athleteName: users.name,
      athleteLastName: users.lastName,
      athleteEmail: users.email,
    })
    .from(guardianInvitations)
    .innerJoin(users, eq(users.id, guardianInvitations.athleteUserId))
    .where(eq(guardianInvitations.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.invalidatedAt || row.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  const athleteName = [row.athleteName, row.athleteLastName]
    .filter(Boolean)
    .join(' ')
    .trim() || row.athleteEmail;
  return {
    athleteName,
    guardianName: row.guardianName,
    relationship: row.relationship,
    alreadyConfirmed: row.consumedAt != null,
    expiresAt: row.expiresAt,
  };
}

export type ConfirmGuardianInput = {
  token: string;
  signatureName: string;
  authorityBasis: string;
  adultDeclared: boolean;
  parentalResponsibilityDeclared: boolean;
  acceptedTerms: boolean;
  acceptedVexatious: boolean;
  aiRecordingAuthorized: boolean;
  ip?: string | null;
  userAgent?: string | null;
};

export async function confirmGuardian(
  params: ConfirmGuardianInput
): Promise<Result<{ athleteName: string }>> {
  if (!params.token || params.token.length > 256) {
    return { ok: false, error: 'Link non valido.' };
  }
  if (
    !params.adultDeclared ||
    !params.parentalResponsibilityDeclared ||
    !params.acceptedTerms ||
    !params.acceptedVexatious
  ) {
    return {
      ok: false,
      error: 'Per procedere devi confermare tutte le dichiarazioni obbligatorie.',
    };
  }
  if (!isAuthorityBasis(params.authorityBasis)) {
    return { ok: false, error: 'Indica a quale titolo stai autorizzando.' };
  }

  const tokenHash = hashGuardianToken(params.token);
  const managementToken = issueGuardianToken();
  const managementTokenHash = hashGuardianToken(managementToken);
  const ip = params.ip?.slice(0, 64) ?? null;
  const userAgent = params.userAgent?.slice(0, 1000) ?? null;
  const signatureName = normalizeSignatureName(params.signatureName);
  const now = new Date();

  const outcome = await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        i.id AS invitation_id,
        i.athlete_guardian_id,
        i.athlete_user_id,
        i.guardian_name,
        i.guardian_email,
        i.relationship,
        i.expires_at,
        i.consumed_at,
        i.invalidated_at,
        g.status AS guardian_status,
        u.name AS athlete_first_name,
        u.last_name AS athlete_last_name,
        u.email AS athlete_email
      FROM guardian_invitations i
      JOIN athlete_guardians g ON g.id = i.athlete_guardian_id
      JOIN users u ON u.id = i.athlete_user_id
      WHERE i.token_hash = ${tokenHash}
      FOR UPDATE OF i, g
    `);
    const invitation = (rows as unknown as Array<{
      invitation_id: string;
      athlete_guardian_id: number;
      athlete_user_id: number;
      guardian_name: string;
      guardian_email: string;
      relationship: string;
      expires_at: Date;
      consumed_at: Date | null;
      invalidated_at: Date | null;
      guardian_status: string;
      athlete_first_name: string | null;
      athlete_last_name: string | null;
      athlete_email: string;
    }>)[0];

    if (
      !invitation ||
      invitation.invalidated_at ||
      invitation.expires_at.getTime() <= now.getTime()
    ) {
      return { error: 'Link non valido o scaduto.' } as const;
    }
    if (invitation.consumed_at) {
      return { error: 'Questo link monouso è già stato utilizzato.' } as const;
    }
    if (invitation.guardian_status !== 'pending') {
      return { error: 'Questa richiesta non è più attiva.' } as const;
    }
    if (!signatureMatchesInvite(signatureName, invitation.guardian_name)) {
      return {
        error:
          'Il nome digitato deve coincidere con il nome completo indicato nell’invito.',
      } as const;
    }
    if (
      !isGuardianRelationship(invitation.relationship) ||
      !authorityMatchesRelationship(
        invitation.relationship,
        params.authorityBasis as AuthorityBasis
      )
    ) {
      return {
        error: 'Il titolo dichiarato non coincide con il rapporto indicato.',
      } as const;
    }

    const bothParentsDeclared = params.authorityBasis === 'joint_agreement';
    const [acceptance] = await tx
      .insert(agreementAcceptances)
      .values({
        userId: null,
        subjectUserId: invitation.athlete_user_id,
        acceptedByEmail: invitation.guardian_email,
        agreementKey: 'guardian-consent',
        version: GUARDIAN_CONSENT_VERSION,
        documentHash: GUARDIAN_CONSENT_HASH,
        acceptedTerms: true,
        acceptedVexatious: true,
        signatureName,
        ipAddress: ip,
        userAgent,
        acceptanceMetadata: {
          documentText: GUARDIAN_CONSENT_TEXT,
          guardianName: invitation.guardian_name,
          relationship: invitation.relationship,
          authorityBasis: params.authorityBasis,
          adultDeclared: true,
          parentalResponsibilityDeclared: true,
          bothParentsDeclared,
          aiRecordingAuthorized: params.aiRecordingAuthorized,
          identityAssuranceLevel: 'verified_email_link_and_typed_name',
        },
      })
      .returning({
        id: agreementAcceptances.id,
        acceptedAt: agreementAcceptances.acceptedAt,
      });

    await tx
      .update(athleteGuardians)
      .set({
        status: 'confirmed',
        confirmedAt: acceptance.acceptedAt,
        confirmedIp: ip,
        confirmedUserAgent: userAgent,
        signatureName,
        authorityBasis: params.authorityBasis,
        bothParentsDeclared,
        aiRecordingAuthorized: params.aiRecordingAuthorized,
        activeAcceptanceId: acceptance.id,
        managementTokenHash,
        revokedAt: null,
        revokedReason: null,
        updatedAt: now,
      })
      .where(eq(athleteGuardians.id, invitation.athlete_guardian_id));

    await tx
      .update(guardianInvitations)
      .set({ consumedAt: now })
      .where(eq(guardianInvitations.id, invitation.invitation_id));
    await tx
      .update(guardianInvitations)
      .set({ invalidatedAt: now })
      .where(
        and(
          eq(
            guardianInvitations.athleteGuardianId,
            invitation.athlete_guardian_id
          ),
          ne(guardianInvitations.id, invitation.invitation_id),
          isNull(guardianInvitations.consumedAt),
          isNull(guardianInvitations.invalidatedAt)
        )
      );

    const [event] = await tx
      .insert(guardianAuthorizationEvents)
      .values({
        athleteUserId: invitation.athlete_user_id,
        athleteGuardianId: invitation.athlete_guardian_id,
        acceptanceId: acceptance.id,
        invitationId: invitation.invitation_id,
        eventType: 'authorization_confirmed',
        actorType: 'guardian',
        ipAddress: ip,
        userAgent,
        eventMetadata: {
          agreementVersion: GUARDIAN_CONSENT_VERSION,
          documentHash: GUARDIAN_CONSENT_HASH,
          aiRecordingAuthorized: params.aiRecordingAuthorized,
          identityAssuranceLevel: 'verified_email_link_and_typed_name',
        },
      })
      .returning({ id: guardianAuthorizationEvents.id });

    const athleteName = [
      invitation.athlete_first_name,
      invitation.athlete_last_name,
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || invitation.athlete_email;
    return {
      athleteName,
      guardianEmail: invitation.guardian_email,
      guardianName: invitation.guardian_name,
      guardianId: invitation.athlete_guardian_id,
      athleteUserId: invitation.athlete_user_id,
      acceptanceId: acceptance.id,
      acceptedAt: acceptance.acceptedAt,
      eventId: event.id,
    } as const;
  });

  if ('error' in outcome && typeof outcome.error === 'string') {
    return { ok: false, error: outcome.error };
  }

  const receipt = await sendNotificationEmail({
    to: outcome.guardianEmail,
    title: `Ricevuta di autorizzazione per ${outcome.athleteName}`,
    body: [
      `Ciao ${outcome.guardianName},`,
      `Autorizzazione registrata il ${outcome.acceptedAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}.`,
      `Firma digitata: ${signatureName}`,
      `Versione documento: ${GUARDIAN_CONSENT_VERSION}`,
      `Impronta SHA-256: ${GUARDIAN_CONSENT_HASH}`,
      `Appunti AI: ${params.aiRecordingAuthorized ? 'autorizzati, con ulteriore consenso di entrambi a ogni sessione' : 'non autorizzati'}.`,
      'COPIA DEL DOCUMENTO ACCETTATO',
      GUARDIAN_CONSENT_TEXT,
      'Conserva questa email. Il collegamento personale consente di revocare l’autorizzazione in qualsiasi momento.',
    ].join('\n\n'),
    link: `/tutore/gestisci?token=${encodeURIComponent(managementToken)}`,
    actionLabel: 'Gestisci o revoca',
  });
  const receiptDelivery = deliveryState(receipt);
  await db.insert(guardianAuthorizationEvents).values({
    athleteUserId: outcome.athleteUserId,
    athleteGuardianId: outcome.guardianId,
    acceptanceId: outcome.acceptanceId,
    eventType:
      receiptDelivery.status === 'sent' ? 'receipt_sent' : 'receipt_failed',
    actorType: 'system',
    eventMetadata: {
      confirmationEventId: outcome.eventId,
      deliveryStatus: receiptDelivery.status,
      ...(receiptDelivery.error
        ? { error: receiptDelivery.error.slice(0, 500) }
        : {}),
    },
  });

  return { ok: true, athleteName: outcome.athleteName };
}

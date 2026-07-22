import 'server-only';
import { eq } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '@/lib/db/drizzle';
import { athleteGuardians, clientProfiles, users } from '@/lib/db/schema';
import { sendNotificationEmail } from '@/lib/core/email';
import { isEmailEnabled } from '@/lib/core/flags';
import type { Result } from '@/lib/core/result';
import { ageFromBirthDate, requiresGuardian } from './age';

export * from './age';

/** Signing key for guardian confirmation links — the app's existing secret. */
function getKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'AUTH_SECRET is missing or too short; guardian confirmation links cannot be signed.'
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * A guardian confirms from an emailed link, with no account and no password,
 * so the link itself is the credential. It is therefore signed, scoped to one
 * athlete, and short-lived: 14 days is long enough for a parent to get around
 * to it and short enough that a forwarded email stops working.
 */
const CONFIRM_TOKEN_TTL = '14 days';

async function signConfirmToken(athleteUserId: number): Promise<string> {
  return new SignJWT({ athleteUserId, purpose: 'guardian-confirm' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(CONFIRM_TOKEN_TTL)
    .sign(getKey());
}

async function verifyConfirmToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), {
      algorithms: ['HS256'],
    });
    if (payload.purpose !== 'guardian-confirm') return null;
    const id = payload.athleteUserId;
    return typeof id === 'number' ? id : null;
  } catch {
    return null;
  }
}

export type GuardianStatus =
  /** 18 or older, or age unknown-but-adult: nothing to authorise. */
  | { kind: 'not_required' }
  /** 15-17 and no guardian invited yet. */
  | { kind: 'missing'; age: number }
  /** 15-17, guardian invited, still waiting for the confirmation. */
  | { kind: 'pending'; age: number; guardianName: string; guardianEmail: string }
  /** 15-17 and authorised. */
  | { kind: 'confirmed'; age: number; guardianName: string }
  /** Birth date not provided: we cannot tell, so we must not let it through. */
  | { kind: 'unknown_age' };

/**
 * Where an athlete stands on parental authorisation. Drives both the dashboard
 * banner and the booking gate, so there is a single definition of "allowed to
 * book" rather than two that can drift apart.
 */
export async function getGuardianStatus(
  athleteUserId: number
): Promise<GuardianStatus> {
  const [profile] = await db
    .select({ birthDate: clientProfiles.birthDate })
    .from(clientProfiles)
    .where(eq(clientProfiles.userId, athleteUserId))
    .limit(1);

  const age = ageFromBirthDate(profile?.birthDate ?? null);
  if (age == null) return { kind: 'unknown_age' };
  if (!requiresGuardian(age)) return { kind: 'not_required' };

  const [g] = await db
    .select({
      guardianName: athleteGuardians.guardianName,
      guardianEmail: athleteGuardians.guardianEmail,
      confirmedAt: athleteGuardians.confirmedAt,
    })
    .from(athleteGuardians)
    .where(eq(athleteGuardians.athleteUserId, athleteUserId))
    .limit(1);

  if (!g) return { kind: 'missing', age };
  if (!g.confirmedAt) {
    return {
      kind: 'pending',
      age,
      guardianName: g.guardianName,
      guardianEmail: g.guardianEmail,
    };
  }
  return { kind: 'confirmed', age, guardianName: g.guardianName };
}

/**
 * Whether this athlete may enter into a session right now. Sessions are the
 * moment the obligation arises, so this — not sign-in — is what the gate
 * protects: a minor can browse and build their profile while waiting.
 *
 * An unknown age blocks too. Letting a missing birth date through would make
 * the whole check optional, since not filling the field would be the easiest
 * way around it.
 */
export async function canBookSessions(
  athleteUserId: number
): Promise<Result> {
  const status = await getGuardianStatus(athleteUserId);
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
          'Hai meno di 18 anni: per prenotare serve l’autorizzazione di un genitore o tutore. Invitalo dalla tua area personale.',
      };
    case 'pending':
      return {
        ok: false,
        error: `Stiamo aspettando la conferma di ${status.guardianName}. Appena autorizza, potrai prenotare.`,
      };
  }
}

/**
 * Invites a guardian and emails them the confirmation link.
 *
 * While the request is still pending, re-inviting overwrites it — that is how
 * a typo in the address gets fixed, without leaving a dead record behind.
 *
 * Once an authorisation has been *confirmed* it is deliberately immutable from
 * here: the row is the evidence that a competent adult accepted the contract,
 * and letting the minor overwrite it would wipe `confirmedAt` and
 * `confirmedIp` — destroying exactly the proof that makes the contract valid.
 * Changing guardian after the fact goes through support.
 */
export async function inviteGuardian(params: {
  athleteUserId: number;
  guardianName: string;
  guardianEmail: string;
  relationship?: string | null;
}): Promise<Result<{ alreadyConfirmed: boolean }>> {
  const status = await getGuardianStatus(params.athleteUserId);
  if (status.kind === 'not_required') {
    return { ok: false, error: 'Non ti serve l’autorizzazione di un tutore.' };
  }
  if (status.kind === 'unknown_age') {
    return {
      ok: false,
      error: 'Indica prima la tua data di nascita nel profilo.',
    };
  }
  if (status.kind === 'confirmed') {
    return { ok: true, alreadyConfirmed: true };
  }

  const name = params.guardianName.trim();
  const email = params.guardianEmail.trim().toLowerCase();
  if (!name) return { ok: false, error: 'Indica il nome del genitore o tutore.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'Indirizzo email non valido.' };
  }

  const [athlete] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, params.athleteUserId))
    .limit(1);
  if (!athlete) return { ok: false, error: 'Atleta non trovato.' };

  // A guardian cannot be the athlete themselves — the whole point is that a
  // second, adult party accepts.
  if (email === athlete.email.trim().toLowerCase()) {
    return {
      ok: false,
      error: 'L’email del tutore deve essere diversa dalla tua.',
    };
  }

  await db
    .insert(athleteGuardians)
    .values({
      athleteUserId: params.athleteUserId,
      guardianName: name,
      guardianEmail: email,
      relationship: params.relationship?.trim() || null,
      createdBy: params.athleteUserId,
    })
    .onConflictDoUpdate({
      target: athleteGuardians.athleteUserId,
      set: {
        guardianName: name,
        guardianEmail: email,
        relationship: params.relationship?.trim() || null,
        // A new invitation restarts the authorisation from scratch.
        confirmedAt: null,
        confirmedIp: null,
        bothParentsDeclared: false,
        updatedAt: new Date(),
        updatedBy: params.athleteUserId,
      },
    });

  const token = await signConfirmToken(params.athleteUserId);
  const athleteName = athlete.name?.trim() || 'un giovane atleta';

  if (isEmailEnabled()) {
    await sendNotificationEmail({
      to: email,
      title: 'Autorizza il percorso di mental coaching',
      body:
        `${athleteName} ti ha indicato come genitore o tutore di riferimento su KaiPai. ` +
        'Per avviare il percorso serve la tua autorizzazione: apri il link qui sotto, ' +
        'leggi i Termini e conferma. Il link è valido 14 giorni.',
      link: `/tutore/conferma?token=${encodeURIComponent(token)}`,
    }).catch((e) => console.error('[guardians] invite email failed:', e));
  } else {
    console.log(
      `[guardians] email disabled — confirmation link for ${email}: /tutore/conferma?token=${token}`
    );
  }

  return { ok: true, alreadyConfirmed: false };
}

export type GuardianInvitation = {
  athleteUserId: number;
  athleteName: string;
  guardianName: string;
  alreadyConfirmed: boolean;
};

/** Resolves a confirmation token into the invitation it refers to. */
export async function getInvitationByToken(
  token: string
): Promise<GuardianInvitation | null> {
  const athleteUserId = await verifyConfirmToken(token);
  if (athleteUserId == null) return null;

  const [row] = await db
    .select({
      guardianName: athleteGuardians.guardianName,
      confirmedAt: athleteGuardians.confirmedAt,
      athleteName: users.name,
      athleteEmail: users.email,
    })
    .from(athleteGuardians)
    .innerJoin(users, eq(users.id, athleteGuardians.athleteUserId))
    .where(eq(athleteGuardians.athleteUserId, athleteUserId))
    .limit(1);
  if (!row) return null;

  return {
    athleteUserId,
    athleteName: row.athleteName?.trim() || row.athleteEmail,
    guardianName: row.guardianName,
    alreadyConfirmed: row.confirmedAt != null,
  };
}

/**
 * Records the guardian's authorisation. `bothParents` is their declaration of
 * acting with the other parent's agreement (art. 316 c.c.); `ip` is kept as
 * evidence of who accepted and from where.
 */
export async function confirmGuardian(params: {
  token: string;
  bothParents: boolean;
  ip?: string | null;
}): Promise<Result<{ athleteName: string }>> {
  const invitation = await getInvitationByToken(params.token);
  if (!invitation) {
    return {
      ok: false,
      error:
        'Link non valido o scaduto. Chiedi al giovane atleta di inviartelo di nuovo.',
    };
  }
  if (!params.bothParents) {
    return {
      ok: false,
      error:
        'Per procedere devi confermare di agire anche per conto dell’altro genitore, se presente.',
    };
  }

  await db
    .update(athleteGuardians)
    .set({
      confirmedAt: new Date(),
      confirmedIp: params.ip?.slice(0, 64) ?? null,
      bothParentsDeclared: true,
      updatedAt: new Date(),
    })
    .where(eq(athleteGuardians.athleteUserId, invitation.athleteUserId));

  return { ok: true, athleteName: invitation.athleteName };
}

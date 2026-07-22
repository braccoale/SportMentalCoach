import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { agreementAcceptances } from '@/lib/db/schema';
import type { Result } from '@/lib/core/result';
import { LEGAL_VERSION } from './processors';
import { LEGAL_CONTENT_HASH } from './content-hash.generated';
import {
  CURRENT_COACH_AGREEMENT_VERSION,
  hashAgreement,
} from './coach-agreement';

/**
 * The platform's own Terms + Privacy + Cookie, accepted together at signup.
 * Other keys ('coach', 'guardian-consent') belong to documents accepted
 * separately and share the same append-only table.
 */
export const PLATFORM_TERMS_KEY = 'platform-terms';

export type AcceptanceContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Records that a user accepted the platform's legal documents.
 *
 * Always an INSERT: the table is append-only, so accepting a new version adds
 * a row and leaves the earlier one intact. What has to survive is the history,
 * not the latest state — "they accepted the current version" is worth little
 * without "and this is what they accepted, and when".
 *
 * Best-effort by design: it takes the transaction from the caller so that
 * signup writes the acceptance atomically with the account, but a failure
 * outside a transaction must never leave a user unable to register.
 */
export async function recordPlatformTermsAcceptance(
  userId: number,
  ctx: AcceptanceContext = {},
  exec: DbOrTx = db
): Promise<void> {
  await exec.insert(agreementAcceptances).values({
    userId,
    agreementKey: PLATFORM_TERMS_KEY,
    version: LEGAL_VERSION,
    documentHash: LEGAL_CONTENT_HASH,
    acceptedTerms: true,
    ipAddress: ctx.ipAddress?.slice(0, 64) ?? null,
    userAgent: ctx.userAgent?.slice(0, 1000) ?? null,
  });
}

export type AcceptanceRecord = {
  version: string;
  documentHash: string;
  acceptedAt: Date;
  ipAddress: string | null;
};

/** The user's most recent acceptance of a document, or null if never accepted. */
export async function getLatestAcceptance(
  userId: number,
  agreementKey: string = PLATFORM_TERMS_KEY
): Promise<AcceptanceRecord | null> {
  const [row] = await db
    .select({
      version: agreementAcceptances.version,
      documentHash: agreementAcceptances.documentHash,
      acceptedAt: agreementAcceptances.acceptedAt,
      ipAddress: agreementAcceptances.ipAddress,
    })
    .from(agreementAcceptances)
    .where(
      and(
        eq(agreementAcceptances.userId, userId),
        eq(agreementAcceptances.agreementKey, agreementKey)
      )
    )
    .orderBy(desc(agreementAcceptances.acceptedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Whether the user has accepted the *current* version. Drives the re-acceptance
 * prompt after the Terms change: an acceptance of an older version is still
 * valid evidence for what it covered, but it does not cover the new text.
 */
export async function hasAcceptedCurrentTerms(
  userId: number
): Promise<boolean> {
  const latest = await getLatestAcceptance(userId);
  return latest?.version === LEGAL_VERSION;
}

/** Il Contratto di Adesione Coach, firmato a parte dalle condizioni generali. */
export const COACH_AGREEMENT_KEY = 'coach';

/**
 * True se il coach ha firmato la versione corrente del Contratto di Adesione,
 * con entrambe le spunte. Non riusa `getLatestAcceptance`: quella non
 * seleziona `acceptedVexatious`, e senza l'approvazione ex art. 1341 la firma
 * non copre le clausole che contano.
 */
export async function hasAcceptedCoachAgreement(
  userId: number
): Promise<boolean> {
  const [row] = await db
    .select({ id: agreementAcceptances.id })
    .from(agreementAcceptances)
    .where(
      and(
        eq(agreementAcceptances.userId, userId),
        eq(agreementAcceptances.agreementKey, COACH_AGREEMENT_KEY),
        eq(agreementAcceptances.version, CURRENT_COACH_AGREEMENT_VERSION),
        eq(agreementAcceptances.acceptedTerms, true),
        eq(agreementAcceptances.acceptedVexatious, true)
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Registra la firma del Contratto di Adesione Coach. Append-only: nessun
 * upsert, nessun controllo di esistenza preventivo — firmare due volte lascia
 * due righe, che è esattamente ciò che vogliamo poter ricostruire.
 */
export async function recordCoachAgreementAcceptance(params: {
  userId: number;
  signatureName: string;
  acceptedTerms: boolean;
  acceptedVexatious: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<Result> {
  if (!params.acceptedTerms) {
    return { ok: false, error: 'Devi accettare il contratto per proseguire.' };
  }
  if (!params.acceptedVexatious) {
    return {
      ok: false,
      error:
        'Devi approvare specificamente le clausole elencate ai sensi dell’art. 1341 c.c.',
    };
  }

  await db.insert(agreementAcceptances).values({
    userId: params.userId,
    agreementKey: COACH_AGREEMENT_KEY,
    version: CURRENT_COACH_AGREEMENT_VERSION,
    acceptedTerms: true,
    acceptedVexatious: true,
    signatureName: params.signatureName.trim().slice(0, 200),
    ipAddress: params.ipAddress?.slice(0, 64) ?? null,
    userAgent: params.userAgent?.slice(0, 1000) ?? null,
    documentHash: hashAgreement(),
  });

  return { ok: true };
}

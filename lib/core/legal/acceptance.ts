import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { agreementAcceptances } from '@/lib/db/schema';
import { LEGAL_VERSION } from './processors';
import { LEGAL_CONTENT_HASH } from './content-hash.generated';

/**
 * The platform's own Terms + Privacy + Cookie, accepted together at signup.
 * Other keys ('coach', 'guardian-consent') belong to documents accepted
 * separately and share the same append-only table.
 */
export const PLATFORM_TERMS_KEY = 'platform-terms';

/**
 * La presa visione della nota sugli Appunti AI da parte del coach.
 *
 * L'art. 4 dell'AI Act chiede a fornitori e deployer di garantire un livello
 * adeguato di alfabetizzazione a chi opera i sistemi per loro conto. Non e' un
 * obbligo che si chiude scrivendo software: si chiude facendo leggere qualcosa
 * a delle persone, e potendo dimostrare che l'hanno letto. La seconda meta'
 * vive qui, nella stessa tabella append-only delle altre accettazioni.
 */
export const AI_LITERACY_KEY = 'ai-literacy';

export type AcceptanceContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  /**
   * Approvazione specifica delle clausole onerose (artt. 1341-1342 c.c.),
   * richiesta a chi si registra come professionista.
   *
   * Va registrata, non solo verificata: per un'approvazione specifica la prova
   * è l'intero scopo. Una spunta imposta al momento della registrazione e poi
   * non conservata, in giudizio, vale quanto non averla mai chiesta.
   */
  acceptedVexatious?: boolean;
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
    acceptedVexatious: ctx.acceptedVexatious ?? false,
    ipAddress: ctx.ipAddress?.slice(0, 64) ?? null,
    userAgent: ctx.userAgent?.slice(0, 1000) ?? null,
  });
}

/**
 * Registra la presa visione di una nota informativa (non un contratto).
 *
 * Separata da `recordPlatformTermsAcceptance` perche' e' un'altra cosa: li' si
 * accetta un accordo, qui si dichiara di aver letto una spiegazione. Condividono
 * la tabella, e devono restare distinguibili dalla chiave.
 */
export async function recordDocumentRead(
  userId: number,
  agreementKey: string,
  ctx: AcceptanceContext = {},
  exec: DbOrTx = db
): Promise<void> {
  await exec.insert(agreementAcceptances).values({
    userId,
    agreementKey,
    version: LEGAL_VERSION,
    documentHash: LEGAL_CONTENT_HASH,
    acceptedTerms: true,
    acceptedVexatious: false,
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
  return (
    latest?.version === LEGAL_VERSION &&
    latest.documentHash === LEGAL_CONTENT_HASH
  );
}

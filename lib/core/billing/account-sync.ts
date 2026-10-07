import 'server-only';
import { and, isNotNull, lt, ne, or, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { coachBillingProfiles } from '@/lib/db/schema';
import { syncCoachStripeStatus } from './index';

/**
 * Tiene allineato lo stato di verifica dei coach con Stripe senza aspettare
 * che aprano la pagina Pagamenti.
 *
 * Gli account sono della versione 2 dell'API, e le loro modifiche **non
 * arrivano** come `account.updated` (provato il 2026-10-07: una modifica
 * all'account non ha generato nessun evento). Gli eventi nuovi sono di un
 * altro tipo, con una consegna a parte: finché non servono davvero, il cron
 * orario rilegge gli account che non sono ancora attivi (la verifica è in
 * corso, il coach sta mandando documenti) e, una volta al giorno, tutti gli
 * altri (un conto può essere sospeso dopo).
 *
 * Un coach per volta, con un tetto: un guasto di Stripe su uno non ferma gli
 * altri né il resto del cron.
 */
const MAX_PER_RUN = 50;
const REFRESH_ACTIVE_AFTER_MS = 24 * 60 * 60 * 1000;

export type AccountSyncResult = { considered: number; synced: number; failed: number };

export async function syncCoachAccountsDue(
  now: Date = new Date()
): Promise<AccountSyncResult> {
  const due = await db
    .select({ coachUserId: coachBillingProfiles.coachUserId })
    .from(coachBillingProfiles)
    .where(
      and(
        isNotNull(coachBillingProfiles.stripeAccountId),
        or(
          ne(coachBillingProfiles.onboardingStatus, 'active'),
          isNull(coachBillingProfiles.lastSyncedAt),
          lt(
            coachBillingProfiles.lastSyncedAt,
            new Date(now.getTime() - REFRESH_ACTIVE_AFTER_MS)
          )
        )
      )
    )
    .limit(MAX_PER_RUN);

  let synced = 0;
  let failed = 0;
  for (const { coachUserId } of due) {
    try {
      await syncCoachStripeStatus(coachUserId);
      synced += 1;
    } catch (error) {
      failed += 1;
      console.error('[payments] verifica del coach non allineata', {
        coachUserId,
        reason: error instanceof Error ? error.message : 'sconosciuto',
      });
    }
  }
  return { considered: due.length, synced, failed };
}

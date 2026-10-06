/**
 * Chi può avviare l'acquisto di un piano, e perché no.
 *
 * Una sola funzione, chiamata dal server subito prima di aprire il Checkout:
 * nascondere un pulsante non è un cancello. L'ordine dei controlli è
 * deliberato: prima ciò che non cambierà (non sei un atleta), poi ciò che il
 * coach può sistemare, infine ciò che sistema l'atleta.
 *
 * Età: solo maggiorenni. Un'età sconosciuta NON vale «non richiesto»: si
 * blocca (`UNKNOWN_AGE`). Per i 15–17 anni il pagante dovrebbe essere il
 * tutore con il suo consenso, e quel percorso non esiste ancora: si rifiutano
 * con un messaggio che lo dice, senza abbassare la soglia dei 18 anni.
 *
 * Modulo puro.
 */

import { AGE_OF_MAJORITY, ageFromBirthDate } from '@/lib/core/guardians/age';
import type { CoachPaymentsState } from './coach-payments';
import { canCharge } from './coach-payments';

export type CheckoutRefusal =
  | 'NOT_ATHLETE'
  | 'DEMO_ACCOUNT'
  | 'SELF_PURCHASE'
  | 'COACH_NOT_ACTIVE'
  | 'PLAN_UNAVAILABLE'
  | 'UNKNOWN_AGE'
  | 'MINOR_NOT_SUPPORTED'
  | 'ALREADY_SUBSCRIBED';

export type CheckoutEligibility =
  | { ok: true }
  | { ok: false; reason: CheckoutRefusal; message: string };

export const CHECKOUT_REFUSAL_MESSAGES: Record<CheckoutRefusal, string> = {
  NOT_ATHLETE: 'Solo gli atleti possono abbonarsi a un percorso.',
  DEMO_ACCOUNT: 'Con un account di prova non si può acquistare.',
  SELF_PURCHASE: 'Non puoi abbonarti ai tuoi stessi percorsi.',
  COACH_NOT_ACTIVE:
    'Questo coach non può ancora ricevere pagamenti. Riprova più tardi.',
  PLAN_UNAVAILABLE: 'Questo percorso non è più disponibile.',
  UNKNOWN_AGE:
    'Per abbonarti ci serve la tua data di nascita. Completa il tuo profilo e riprova.',
  MINOR_NOT_SUPPORTED:
    'L’acquisto è riservato ai maggiorenni. Per i minorenni sarà disponibile con l’autorizzazione di un genitore o tutore.',
  ALREADY_SUBSCRIBED:
    'Hai già un abbonamento attivo con questo coach.',
};

export type CheckoutEligibilityInput = {
  viewer: {
    userId: number;
    isAthlete: boolean;
    isDemo: boolean;
    birthDate: string | Date | null | undefined;
  };
  coachUserId: number;
  coachState: CoachPaymentsState;
  plan: { status: string; coachUserId: number } | null;
  /** L'atleta ha già un abbonamento attivo o in ritardo con questo coach. */
  hasLiveSubscriptionWithCoach: boolean;
  at?: Date;
};

export function checkoutEligibility(
  input: CheckoutEligibilityInput
): CheckoutEligibility {
  const refuse = (reason: CheckoutRefusal): CheckoutEligibility => ({
    ok: false,
    reason,
    message: CHECKOUT_REFUSAL_MESSAGES[reason],
  });

  if (!input.viewer.isAthlete) return refuse('NOT_ATHLETE');
  if (input.viewer.isDemo) return refuse('DEMO_ACCOUNT');
  if (input.viewer.userId === input.coachUserId) return refuse('SELF_PURCHASE');
  if (!canCharge(input.coachState)) return refuse('COACH_NOT_ACTIVE');

  // Il piano deve essere attivo e di QUESTO coach: l'identificativo arriva dal
  // browser, e un piano di un altro coach non si compra passando per il suo.
  if (
    !input.plan ||
    input.plan.status !== 'active' ||
    input.plan.coachUserId !== input.coachUserId
  ) {
    return refuse('PLAN_UNAVAILABLE');
  }

  const age = ageFromBirthDate(input.viewer.birthDate, input.at);
  if (age === null) return refuse('UNKNOWN_AGE');
  if (age < AGE_OF_MAJORITY) return refuse('MINOR_NOT_SUPPORTED');

  if (input.hasLiveSubscriptionWithCoach) return refuse('ALREADY_SUBSCRIBED');

  return { ok: true };
}

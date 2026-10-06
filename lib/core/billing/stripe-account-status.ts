/**
 * Dallo stato di un account collegato su Stripe (Accounts v2) a ciò che
 * KaiPai ricorda del coach: se può incassare e che cosa gli manca.
 *
 * Non si legge `charges_enabled` né `payouts_enabled` (campi della v1,
 * deprecati): Stripe indica di guardare lo stato della capacità
 * `card_payments` nella configurazione merchant. I bonifici si leggono dalla
 * capacità `stripe_balance.payouts` quando c'è; in sua assenza si considerano
 * possibili solo se non resta niente da fornire.
 *
 * Nel dubbio si chiude: un account che non sappiamo leggere non è «attivo».
 *
 * Modulo puro: si prova con payload scritti a mano, senza rete.
 */

import type { OnboardingStatus } from './coach-payments';

type Capability = { status?: string | null } | null | undefined;

export type StripeAccountSnapshot = {
  closed?: boolean | null;
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: Capability;
        stripe_balance?: { payouts?: Capability } | null;
      } | null;
    } | null;
  } | null;
  requirements?: {
    entries?: Array<{
      awaiting_action_from?: string | null;
      description?: string | null;
    }> | null;
  } | null;
};

export type DerivedBillingProfile = {
  onboardingStatus: OnboardingStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** Percorsi grezzi di Stripe: servono a noi, non vanno mostrati al coach. */
  requirementsDue: string[];
};

/** Le voci su cui Stripe aspetta il coach (non Stripe, non la piattaforma). */
export function outstandingRequirements(
  snapshot: StripeAccountSnapshot
): string[] {
  const entries = snapshot.requirements?.entries ?? [];
  const due = entries
    .filter((entry) => entry.awaiting_action_from === 'user')
    .map((entry) => (entry.description ?? '').trim())
    .filter(Boolean);
  return [...new Set(due)];
}

export function deriveBillingProfileFromStripeAccount(
  snapshot: StripeAccountSnapshot,
  previousStatus: OnboardingStatus | string = 'not_started'
): DerivedBillingProfile {
  const requirementsDue = outstandingRequirements(snapshot);

  if (snapshot.closed) {
    return {
      onboardingStatus: 'disabled',
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsDue,
    };
  }

  const capabilities = snapshot.configuration?.merchant?.capabilities;
  const cardStatus = capabilities?.card_payments?.status ?? null;
  if (cardStatus === 'unsupported') {
    return {
      onboardingStatus: 'disabled',
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsDue,
    };
  }

  const chargesEnabled = cardStatus === 'active';
  const payoutStatus = capabilities?.stripe_balance?.payouts?.status;
  const payoutsEnabled =
    payoutStatus !== undefined && payoutStatus !== null
      ? payoutStatus === 'active'
      : chargesEnabled && requirementsDue.length === 0;

  let onboardingStatus: OnboardingStatus;
  if (chargesEnabled && payoutsEnabled) {
    onboardingStatus = 'active';
  } else if (previousStatus === 'active' || previousStatus === 'restricted') {
    // Funzionava e ora no: Stripe ha limitato qualcosa, non è una verifica nuova.
    onboardingStatus = 'restricted';
  } else {
    onboardingStatus = 'pending';
  }

  return { onboardingStatus, chargesEnabled, payoutsEnabled, requirementsDue };
}

/**
 * Ciò che serve al coach, in italiano. Le voci che non riconosciamo non
 * spariscono: diventano «altre informazioni richieste da Stripe», perché
 * nasconderle farebbe sembrare completa una verifica che non lo è.
 */
const REQUIREMENT_LABELS: Array<[RegExp, string]> = [
  [/document|verification\.(front|back)|passport/i, 'documento d’identità'],
  [/id_number|tax_id|fiscal|ssn/i, 'codice fiscale'],
  [/dob|birth/i, 'data di nascita'],
  [/given_name|surname|first_name|last_name|\.name$/i, 'nome e cognome'],
  [/nationalit|citizen/i, 'cittadinanza'],
  [/address|city|postal|state/i, 'indirizzo'],
  [/external_account|bank|iban/i, 'IBAN del conto per i bonifici'],
  [/tos|terms/i, 'accettazione dei termini di Stripe'],
  [/phone/i, 'numero di telefono'],
  [/email/i, 'indirizzo email'],
  [/business_url|\.url$|website/i, 'sito web o profilo pubblico'],
  [/product_description|description/i, 'descrizione della tua attività'],
  [/mcc|industry|category/i, 'categoria dell’attività'],
];

export const UNKNOWN_REQUIREMENT_LABEL =
  'altre informazioni richieste da Stripe';

export function describeRequirement(path: string): string {
  for (const [pattern, label] of REQUIREMENT_LABELS) {
    if (pattern.test(path)) return label;
  }
  return UNKNOWN_REQUIREMENT_LABEL;
}

/** Elenco senza doppioni, nell'ordine in cui Stripe le ha date. */
export function describeRequirements(paths: string[]): string[] {
  return [...new Set(paths.map(describeRequirement))];
}

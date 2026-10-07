/**
 * Lo stato dei pagamenti di un coach, e che cosa ne consegue per chi guarda.
 *
 * Due decisioni indipendenti convivono e non si fondono:
 *  - `paymentsEnabled` lo decide l'admin (KaiPai): senza, il coach vede la
 *    piattaforma esattamente com'era, e l'atleta non vede nessun prezzo;
 *  - `chargesEnabled` / `payoutsEnabled` / `onboardingStatus` li decide Stripe
 *    dopo la verifica d'identità (KYC) del coach, e li copiamo dal webhook.
 *
 * I prezzi e l'acquisto sono visibili all'atleta solo quando **entrambe** sono
 * vere. Nel dubbio si nasconde: un prezzo mostrato per un coach che non può
 * incassare è un acquisto che fallisce davanti a una persona.
 *
 * Modulo puro: si prova senza database né rete.
 */

export const ONBOARDING_STATUSES = [
  'not_started',
  'pending',
  'active',
  'restricted',
  'disabled',
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export type CoachPaymentsProfile = {
  paymentsEnabled: boolean;
  onboardingStatus: OnboardingStatus | string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export const COACH_PAYMENTS_STATES = [
  /** Pagamenti non attivati dall'admin: nessuna sezione, nessun prezzo. */
  'off',
  /** Attivati dall'admin, il coach non ha ancora iniziato la verifica. */
  'kyc_required',
  /** Verifica iniziata o incompleta: Stripe aspetta ancora qualcosa. */
  'kyc_in_progress',
  /** Era verificato, ora Stripe ha limitato o disabilitato l'account. */
  'restricted',
  /** Può incassare e ricevere i bonifici. */
  'active',
] as const;
export type CoachPaymentsState = (typeof COACH_PAYMENTS_STATES)[number];

export function coachPaymentsState(
  profile: CoachPaymentsProfile | null | undefined
): CoachPaymentsState {
  if (!profile || !profile.paymentsEnabled) return 'off';

  if (
    profile.onboardingStatus === 'active' &&
    profile.chargesEnabled &&
    profile.payoutsEnabled
  ) {
    return 'active';
  }
  if (
    profile.onboardingStatus === 'restricted' ||
    profile.onboardingStatus === 'disabled'
  ) {
    return 'restricted';
  }
  // `active` con un permesso mancante è un'incoerenza: si tratta come verifica
  // non conclusa, cioè si chiude.
  if (
    profile.onboardingStatus === 'pending' ||
    profile.onboardingStatus === 'active'
  ) {
    return 'kyc_in_progress';
  }
  return 'kyc_required';
}

/** Il coach vede le sezioni nuove (pagamenti, piani) solo se attivato. */
export function coachSeesPaymentsSection(state: CoachPaymentsState): boolean {
  return state !== 'off';
}

/** Può preparare i propri piani anche prima di aver finito la verifica. */
export function coachCanEditPlans(state: CoachPaymentsState): boolean {
  return state !== 'off';
}

/** Prezzi, pacchetti e acquisto sono visibili all'atleta solo qui. */
export function athleteCanSeePricing(state: CoachPaymentsState): boolean {
  return state === 'active';
}

/** L'addebito può partire solo qui. Oggi coincide con la visibilità. */
export function canCharge(state: CoachPaymentsState): boolean {
  return state === 'active';
}

/** Etichetta breve per l'admin: dice a che punto è il coach, non solo se è acceso. */
export const COACH_PAYMENTS_STATE_LABEL: Record<CoachPaymentsState, string> = {
  off: 'spenti',
  kyc_required: 'attivi · verifica da fare',
  kyc_in_progress: 'attivi · verifica in corso',
  restricted: 'attivi · account limitato da Stripe',
  active: 'attivi · può incassare',
};

/**
 * Piani e prezzi sul profilo del coach: li vede solo un atleta con un account,
 * e solo se il coach può incassare. Chi non è entrato nel sito, e chiunque non
 * sia un atleta (un altro coach, un admin), non li vede: i prezzi non entrano
 * nelle pagine pubbliche né nei risultati di ricerca.
 */
export function athleteCanSeePlans(
  state: CoachPaymentsState,
  viewer: { isAthlete: boolean }
): boolean {
  return viewer.isAthlete && athleteCanSeePricing(state);
}

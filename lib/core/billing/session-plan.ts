/**
 * Il piano di sedute mensile che un coach vende: quante sedute e a che prezzo.
 *
 * I limiti non sono scritti qui come regola ma passati dal chiamante, che li
 * legge da `system_config` (con i `DEFAULT_PLAN_LIMITS` come ripiego): cambiare
 * un tetto non deve richiedere una migrazione né un rilascio.
 *
 * I soldi sono centesimi interi, sempre. Il prezzo digitato dal coach in euro
 * si converte leggendo le cifre, mai con una moltiplicazione in virgola mobile
 * (`19.99 * 100` vale `1998.9999999999998`).
 *
 * Modulo puro.
 */

export type PlanLimits = {
  minSessions: number;
  maxSessions: number;
  minPriceCents: number;
  maxPriceCents: number;
  /** Quanti piani attivi può avere insieme: più di pochi è confusione per l'atleta. */
  maxActivePlans: number;
};

export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  minSessions: 1,
  maxSessions: 12,
  minPriceCents: 1_000,
  maxPriceCents: 200_000,
  maxActivePlans: 5,
};

/** Chiavi di `system_config` con cui si sostituiscono i ripieghi. */
export const PLAN_LIMIT_CONFIG_KEYS = {
  minSessions: 'BILLING_PLAN_MIN_SESSIONS',
  maxSessions: 'BILLING_PLAN_MAX_SESSIONS',
  minPriceCents: 'BILLING_PLAN_MIN_PRICE_CENTS',
  maxPriceCents: 'BILLING_PLAN_MAX_PRICE_CENTS',
  maxActivePlans: 'BILLING_PLAN_MAX_ACTIVE',
} as const satisfies Record<keyof PlanLimits, string>;

export const PLAN_NAME_MAX_LENGTH = 80;
export const PLAN_DESCRIPTION_MAX_LENGTH = 120;

/**
 * «120», «120,5», «120.50», «1.200,00» → centesimi. `null` se non è un
 * importo leggibile (lettere, tre decimali, segno negativo, vuoto).
 */
export function parseEuroToCents(input: string): number | null {
  const raw = input.trim().replace(/\s|€/g, '');
  if (!raw) return null;

  let normalized = raw;
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  if (hasComma && hasDot) {
    // L'ultimo separatore è il decimale, l'altro raggruppa le migliaia.
    const decimalIsComma = raw.lastIndexOf(',') > raw.lastIndexOf('.');
    normalized = decimalIsComma
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (hasComma) {
    normalized = raw.replace(',', '.');
  }

  const match = normalized.match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const euros = Number(match[1]);
  const cents = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  return euros * 100 + cents;
}

/** «120,00 €». Scritto a mano: `Intl` cambia con l'ICU del runtime. */
export function formatEuroCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped},${rest} €`;
}

/** Prezzo medio di una seduta del piano, arrotondato al centesimo. */
export function perSessionCents(
  monthlyPriceCents: number,
  sessionsPerMonth: number
): number {
  if (sessionsPerMonth <= 0) throw new Error('INVALID_SESSIONS');
  return Math.round(monthlyPriceCents / sessionsPerMonth);
}

export type SessionPlanInput = {
  name: string;
  /** Frase breve sotto il nome, facoltativa. */
  description?: string;
  recommended?: boolean;
  sessionsPerMonth: number | string;
  /** Euro, come lo scrive il coach. */
  monthlyPrice: string;
};

export type SessionPlanErrors = Partial<
  Record<'name' | 'description' | 'sessionsPerMonth' | 'monthlyPrice', string>
>;

export type SessionPlanValidation =
  | {
      ok: true;
      value: {
        name: string;
        description: string | null;
        recommended: boolean;
        sessionsPerMonth: number;
        monthlyPriceCents: number;
      };
    }
  | { ok: false; errors: SessionPlanErrors };

export function validateSessionPlan(
  input: SessionPlanInput,
  limits: PlanLimits = DEFAULT_PLAN_LIMITS
): SessionPlanValidation {
  const errors: SessionPlanErrors = {};

  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) errors.name = 'Dai un nome al piano.';
  else if (name.length > PLAN_NAME_MAX_LENGTH) {
    errors.name = `Il nome può avere al massimo ${PLAN_NAME_MAX_LENGTH} caratteri.`;
  }

  const description = (input.description ?? '').trim().replace(/\s+/g, ' ');
  if (description.length > PLAN_DESCRIPTION_MAX_LENGTH) {
    errors.description = `La frase può avere al massimo ${PLAN_DESCRIPTION_MAX_LENGTH} caratteri.`;
  }

  const sessions =
    typeof input.sessionsPerMonth === 'number'
      ? input.sessionsPerMonth
      : /^\d{1,3}$/.test(input.sessionsPerMonth.trim())
        ? Number(input.sessionsPerMonth.trim())
        : NaN;
  if (!Number.isInteger(sessions)) {
    errors.sessionsPerMonth = 'Indica quante sedute al mese, con un numero intero.';
  } else if (sessions < limits.minSessions || sessions > limits.maxSessions) {
    errors.sessionsPerMonth = `Da ${limits.minSessions} a ${limits.maxSessions} sedute al mese.`;
  }

  const cents = parseEuroToCents(input.monthlyPrice);
  if (cents === null) {
    errors.monthlyPrice = 'Indica il prezzo mensile in euro, per esempio 120 o 119,90.';
  } else if (cents < limits.minPriceCents || cents > limits.maxPriceCents) {
    errors.monthlyPrice = `Il prezzo mensile va da ${formatEuroCents(limits.minPriceCents)} a ${formatEuroCents(limits.maxPriceCents)}.`;
  }

  if (Object.keys(errors).length > 0 || cents === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      name,
      description: description || null,
      recommended: Boolean(input.recommended),
      sessionsPerMonth: sessions,
      monthlyPriceCents: cents,
    },
  };
}

/** Si può attivare un altro piano senza superare il tetto? */
export function canActivateAnotherPlan(
  activeCount: number,
  limits: PlanLimits = DEFAULT_PLAN_LIMITS
): boolean {
  return activeCount < limits.maxActivePlans;
}

/**
 * Il colore di un piano nella scheda dell'atleta: fisso per posizione, non
 * scelto dal coach, così le schede dei coach restano riconoscibili tra loro.
 * Oltre il quarto piano si riparte dal primo.
 */
export const PLAN_ACCENTS = ['blue', 'emerald', 'violet', 'orange'] as const;
export type PlanAccent = (typeof PLAN_ACCENTS)[number];

export function planAccentForPosition(index: number): PlanAccent {
  const safe = Number.isInteger(index) && index >= 0 ? index : 0;
  return PLAN_ACCENTS[safe % PLAN_ACCENTS.length];
}

/**
 * Quale piano è preselezionato: quello che il coach consiglia, altrimenti il
 * primo. Mai uno che non sia nell'elenco.
 */
export function defaultSelectedPlanId(
  plans: Array<{ id: number; isRecommended: boolean }>
): number | null {
  if (plans.length === 0) return null;
  return (plans.find((plan) => plan.isRecommended) ?? plans[0]).id;
}

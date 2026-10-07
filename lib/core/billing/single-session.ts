/**
 * La seduta singola e la seduta extra: il prezzo di UNA seduta, deciso dal
 * coach, e quanto dura una seduta acquistata a parte.
 *
 * Le sedute di un abbonamento si calcolano contando le prenotazioni; una seduta
 * acquistata a parte, invece, ha una scadenza propria (60 giorni
 * dall'acquisto) e per questo sta in un registro (`session_credits`).
 *
 * Il prezzo vale sia per chi non ha un abbonamento («una sola seduta») sia per
 * chi ce l'ha e ha finito le sedute del mese («aggiungi una seduta»). Vuoto =
 * il coach non la vende, e nessuna delle due offerte compare.
 *
 * Modulo puro.
 */

import { parseEuroToCents, formatEuroCents } from './session-plan';

/** Per quanti giorni una seduta acquistata a parte si può prenotare. */
export const SINGLE_SESSION_VALIDITY_DAYS = 60;

export type SingleSessionLimits = {
  minPriceCents: number;
  maxPriceCents: number;
};

export const DEFAULT_SINGLE_SESSION_LIMITS: SingleSessionLimits = {
  minPriceCents: 1_000,
  maxPriceCents: 50_000,
};

/** Chiavi di `system_config` con cui si sostituiscono i ripieghi. */
export const SINGLE_SESSION_LIMIT_CONFIG_KEYS = {
  minPriceCents: 'BILLING_SINGLE_MIN_PRICE_CENTS',
  maxPriceCents: 'BILLING_SINGLE_MAX_PRICE_CENTS',
} as const satisfies Record<keyof SingleSessionLimits, string>;

export type SingleSessionPriceResult =
  /** `priceCents: null` = il coach toglie la vendita della seduta singola. */
  | { ok: true; priceCents: number | null }
  | { ok: false; error: string };

export function validateSingleSessionPrice(
  input: string,
  limits: SingleSessionLimits = DEFAULT_SINGLE_SESSION_LIMITS
): SingleSessionPriceResult {
  if (!input.trim()) return { ok: true, priceCents: null };

  const cents = parseEuroToCents(input);
  if (cents === null) {
    return {
      ok: false,
      error: 'Indica il prezzo in euro, per esempio 100 o 99,90.',
    };
  }
  if (cents < limits.minPriceCents || cents > limits.maxPriceCents) {
    return {
      ok: false,
      error: `Il prezzo di una seduta va da ${formatEuroCents(limits.minPriceCents)} a ${formatEuroCents(limits.maxPriceCents)}.`,
    };
  }
  return { ok: true, priceCents: cents };
}

/** Quando scade una seduta acquistata a parte. Istante + 60 giorni, senza fusi. */
export function singleSessionExpiresAt(grantedAt: Date): Date {
  if (Number.isNaN(grantedAt.getTime())) throw new Error('INVALID_GRANTED_AT');
  return new Date(
    grantedAt.getTime() + SINGLE_SESSION_VALIDITY_DAYS * 24 * 60 * 60 * 1000
  );
}

/** Una seduta acquistata è prenotabile se è stata pagata e non è scaduta. */
export function isCreditUsable(
  credit: { status: string; expiresAt: Date | null },
  now: Date
): boolean {
  return (
    credit.status === 'granted' &&
    credit.expiresAt !== null &&
    credit.expiresAt.getTime() > now.getTime()
  );
}

/** Gli stati di una prenotazione che liberano di nuovo la seduta che teneva. */
export const FREEING_BOOKING_STATUSES = ['cancelled', 'declined', 'expired'] as const;

/**
 * Se una seduta pagata è prenotabile adesso: pagata, non scaduta, e senza una
 * prenotazione viva che la tiene. Lo stato si deriva dalla prenotazione
 * collegata, non si memorizza: così chi cambia lo stato di una prenotazione
 * non deve ricordarsi del registro.
 */
export function isCreditFree(
  credit: { status: string; expiresAt: Date | null },
  linkedBookingStatus: string | null,
  now: Date
): boolean {
  if (!isCreditUsable(credit, now)) return false;
  return (
    linkedBookingStatus === null ||
    (FREEING_BOOKING_STATUSES as readonly string[]).includes(linkedBookingStatus)
  );
}

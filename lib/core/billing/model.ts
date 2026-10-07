import { AGE_OF_MAJORITY, ageFromBirthDate } from '@/lib/core/guardians/age';

export const COMMERCIAL_SOURCES = ['KAIPAI_SOURCED', 'COACH_SOURCED'] as const;
export type CommercialSource = (typeof COMMERCIAL_SOURCES)[number];

export const PRODUCT_SHAPES = {
  single: { billingMode: 'one_off', sessionQuantity: 1 },
  extra: { billingMode: 'one_off', sessionQuantity: 1 },
  essential: { billingMode: 'subscription', sessionQuantity: 2 },
  performance: { billingMode: 'subscription', sessionQuantity: 4 },
} as const;

export type BillingProduct = keyof typeof PRODUCT_SHAPES;

export type ReferralEvidence = {
  id: number;
  inviterUserId: number;
  referredUserId: number;
};

/**
 * Commercial attribution is derived from the existing immutable signup
 * referral. A generic referral counts as coach-sourced only when its inviter
 * is the coach in this exact pair. No caller supplies the resulting source.
 */
export function deriveCommercialAttribution(params: {
  coachUserId: number;
  athleteUserId: number;
  referral: ReferralEvidence | null;
}): {
  source: CommercialSource;
  commissionBps: 1000 | 3000;
  evidenceReferralId: number | null;
} {
  const isCoachReferral =
    params.referral?.inviterUserId === params.coachUserId &&
    params.referral.referredUserId === params.athleteUserId;

  return isCoachReferral
    ? {
        source: 'COACH_SOURCED',
        commissionBps: 1000,
        evidenceReferralId: params.referral!.id,
      }
    : {
        source: 'KAIPAI_SOURCED',
        commissionBps: 3000,
        evidenceReferralId: null,
      };
}

export function calculateOrderSnapshot(params: {
  product: BillingProduct;
  coachRateCents: number;
  source: CommercialSource;
}) {
  if (!Number.isSafeInteger(params.coachRateCents) || params.coachRateCents <= 0) {
    throw new Error('INVALID_COACH_RATE');
  }

  const shape = PRODUCT_SHAPES[params.product];
  const grossAmountCents = params.coachRateCents * shape.sessionQuantity;
  if (!Number.isSafeInteger(grossAmountCents)) throw new Error('AMOUNT_OVERFLOW');

  const platformCommissionBps = params.source === 'COACH_SOURCED' ? 1000 : 3000;
  // A cent is indivisible. KaiPai's fee is rounded to the nearest cent and the
  // coach receives the exact remainder, preserving gross = fee + compensation.
  const platformFeeCents = Math.round(
    (grossAmountCents * platformCommissionBps) / 10_000
  );

  return {
    productType: params.product,
    billingMode: shape.billingMode,
    sessionQuantity: shape.sessionQuantity,
    coachRateCents: params.coachRateCents,
    grossAmountCents,
    platformCommissionBps,
    platformFeeCents,
    coachCompensationCents: grossAmountCents - platformFeeCents,
    acquisitionSource: params.source,
  } as const;
}

export type AdultCheckoutEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'UNKNOWN_AGE' | 'MINOR_NOT_SUPPORTED' };

/** Phase 1/initial payment MVP gate: guardian payers are representable, not usable yet. */
export function adultCheckoutEligibility(params: {
  birthDate: string | Date | null | undefined;
  at?: Date;
}): AdultCheckoutEligibility {
  const age = ageFromBirthDate(params.birthDate, params.at);
  if (age === null) return { eligible: false, reason: 'UNKNOWN_AGE' };
  if (age < AGE_OF_MAJORITY) {
    return { eligible: false, reason: 'MINOR_NOT_SUPPORTED' };
  }
  return { eligible: true };
}

/**
 * Subscription credits can be used in their grant period and in the following
 * monthly period only. We derive the next boundary in UTC and clamp month-end
 * dates (for example 31 January -> 28/29 February).
 */
export function subscriptionCreditExpiresAt(currentPeriodEnd: Date): Date {
  if (Number.isNaN(currentPeriodEnd.getTime())) throw new Error('INVALID_PERIOD_END');
  const year = currentPeriodEnd.getUTCFullYear();
  const month = currentPeriodEnd.getUTCMonth();
  const day = currentPeriodEnd.getUTCDate();
  const lastDayNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month + 1,
      Math.min(day, lastDayNextMonth),
      currentPeriodEnd.getUTCHours(),
      currentPeriodEnd.getUTCMinutes(),
      currentPeriodEnd.getUTCSeconds(),
      currentPeriodEnd.getUTCMilliseconds()
    )
  );
}

export function assertRolloverGeneration(generation: number): 0 | 1 {
  if (generation !== 0 && generation !== 1) throw new Error('ROLLOVER_LIMIT_EXCEEDED');
  return generation;
}

export const SESSION_CREDIT_STATUSES = [
  'available',
  'reserved',
  'consumed',
  'expired',
  'revoked',
] as const;
export type SessionCreditStatus = (typeof SESSION_CREDIT_STATUSES)[number];

export type CreditLifecycle = {
  status: SessionCreditStatus;
  expiresAt: Date;
  bookingId: number | null;
  reservedAt: Date | null;
  consumedAt: Date | null;
};

export type CreditTransitionError =
  | 'CREDIT_NOT_AVAILABLE'
  | 'CREDIT_EXPIRED'
  | 'INVALID_BOOKING'
  | 'CREDIT_NOT_RESERVED'
  | 'INVALID_TRANSITION';

export type CreditTransition =
  | { ok: true; credit: CreditLifecycle }
  | { ok: false; error: CreditTransitionError };

/** Atomically reservable shape: persistence must update only status=available. */
export function reserveCredit(
  credit: CreditLifecycle,
  params: { bookingId: number; now: Date }
): CreditTransition {
  if (!Number.isSafeInteger(params.bookingId) || params.bookingId <= 0) {
    return { ok: false, error: 'INVALID_BOOKING' };
  }
  if (credit.status !== 'available' || credit.bookingId !== null) {
    return { ok: false, error: 'CREDIT_NOT_AVAILABLE' };
  }
  if (credit.expiresAt.getTime() <= params.now.getTime()) {
    return { ok: false, error: 'CREDIT_EXPIRED' };
  }
  return {
    ok: true,
    credit: {
      ...credit,
      status: 'reserved',
      bookingId: params.bookingId,
      reservedAt: params.now,
      consumedAt: null,
    },
  };
}

export type ReservedCreditOutcome =
  | 'session_completed'
  | 'athlete_cancelled_in_time'
  | 'athlete_cancelled_late'
  | 'athlete_no_show'
  | 'coach_cancelled';

/**
 * A reservation survives its original expiry. Validity is checked when it is
 * reserved, so a session scheduled after renewal may still complete normally.
 */
export function settleReservedCredit(
  credit: CreditLifecycle,
  params: { outcome: ReservedCreditOutcome; now: Date }
): CreditTransition {
  if (credit.status !== 'reserved' || credit.bookingId === null || !credit.reservedAt) {
    return { ok: false, error: 'CREDIT_NOT_RESERVED' };
  }

  if (
    params.outcome === 'athlete_cancelled_in_time' ||
    params.outcome === 'coach_cancelled'
  ) {
    return {
      ok: true,
      credit: {
        ...credit,
        status: 'available',
        bookingId: null,
        reservedAt: null,
        consumedAt: null,
      },
    };
  }

  return {
    ok: true,
    credit: { ...credit, status: 'consumed', consumedAt: params.now },
  };
}

export function expireAvailableCredit(
  credit: CreditLifecycle,
  now: Date
): CreditTransition {
  if (credit.status !== 'available') return { ok: false, error: 'INVALID_TRANSITION' };
  if (credit.expiresAt.getTime() > now.getTime()) {
    return { ok: false, error: 'INVALID_TRANSITION' };
  }
  return { ok: true, credit: { ...credit, status: 'expired' } };
}

export const MVP_CANCELLATION_NOTICE_HOURS = 24;

export function athleteCancellationOutcome(params: {
  scheduledFor: Date;
  cancelledAt: Date;
}): Extract<ReservedCreditOutcome, 'athlete_cancelled_in_time' | 'athlete_cancelled_late'> {
  const noticeMs = params.scheduledFor.getTime() - params.cancelledAt.getTime();
  return noticeMs >= MVP_CANCELLATION_NOTICE_HOURS * 60 * 60 * 1000
    ? 'athlete_cancelled_in_time'
    : 'athlete_cancelled_late';
}

export const ONE_OFF_CREDIT_VALIDITY_DAYS = 60;

export function oneOffCreditExpiresAt(
  product: Extract<BillingProduct, 'single' | 'extra'>,
  grantedAt: Date
): Date {
  if (product !== 'single' && product !== 'extra') throw new Error('NOT_ONE_OFF');
  if (Number.isNaN(grantedAt.getTime())) throw new Error('INVALID_GRANTED_AT');
  return new Date(grantedAt.getTime() + ONE_OFF_CREDIT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

export type SubscriptionPriceSnapshot = ReturnType<typeof calculateOrderSnapshot>;

/** Renewals reuse the original subscription snapshot even if the coach rate changes. */
export function renewalPriceSnapshot(snapshot: SubscriptionPriceSnapshot) {
  if (snapshot.billingMode !== 'subscription') throw new Error('NOT_SUBSCRIPTION');
  return { ...snapshot };
}

/** A new subscription, including one after full cancellation, uses the current rate. */
export function newSubscriptionPriceSnapshot(params: {
  plan: Extract<BillingProduct, 'essential' | 'performance'>;
  currentCoachRateCents: number;
  source: CommercialSource;
}) {
  return calculateOrderSnapshot({
    product: params.plan,
    coachRateCents: params.currentCoachRateCents,
    source: params.source,
  });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adultCheckoutEligibility,
  assertRolloverGeneration,
  athleteCancellationOutcome,
  calculateOrderSnapshot,
  deriveCommercialAttribution,
  expireAvailableCredit,
  newSubscriptionPriceSnapshot,
  oneOffCreditExpiresAt,
  renewalPriceSnapshot,
  reserveCredit,
  settleReservedCredit,
  subscriptionCreditExpiresAt,
} from './model';

test('derives COACH_SOURCED only from a referral by the same coach for the same athlete', () => {
  assert.deepEqual(
    deriveCommercialAttribution({
      coachUserId: 7,
      athleteUserId: 12,
      referral: { id: 99, inviterUserId: 7, referredUserId: 12 },
    }),
    { source: 'COACH_SOURCED', commissionBps: 1000, evidenceReferralId: 99 }
  );
  assert.equal(
    deriveCommercialAttribution({
      coachUserId: 8,
      athleteUserId: 12,
      referral: { id: 99, inviterUserId: 7, referredUserId: 12 },
    }).source,
    'KAIPAI_SOURCED'
  );
  assert.equal(
    deriveCommercialAttribution({ coachUserId: 7, athleteUserId: 12, referral: null })
      .source,
    'KAIPAI_SOURCED'
  );
});

test('calculates immutable price snapshots with the 10% coach-sourced split', () => {
  assert.deepEqual(calculateOrderSnapshot({ product: 'essential', coachRateCents: 7000, source: 'COACH_SOURCED' }), {
    productType: 'essential', billingMode: 'subscription', sessionQuantity: 2,
    coachRateCents: 7000, grossAmountCents: 14000, platformCommissionBps: 1000,
    platformFeeCents: 1400, coachCompensationCents: 12600, acquisitionSource: 'COACH_SOURCED',
  });
});

test('calculates immutable price snapshots with the 30% KaiPai-sourced split', () => {
  const snapshot = calculateOrderSnapshot({ product: 'performance', coachRateCents: 7000, source: 'KAIPAI_SOURCED' });
  assert.equal(snapshot.grossAmountCents, 28000);
  assert.equal(snapshot.platformFeeCents, 8400);
  assert.equal(snapshot.coachCompensationCents, 19600);
  assert.equal(snapshot.sessionQuantity, 4);
});

test('rounds the fee to cents and always preserves the captured gross snapshot', () => {
  const snapshot = calculateOrderSnapshot({ product: 'single', coachRateCents: 1001, source: 'KAIPAI_SOURCED' });
  assert.equal(snapshot.platformFeeCents, 300);
  assert.equal(snapshot.platformFeeCents + snapshot.coachCompensationCents, 1001);
});

test('supports adult checkout and explicitly refuses minor or unknown age', () => {
  const at = new Date('2026-09-21T12:00:00Z');
  assert.deepEqual(adultCheckoutEligibility({ birthDate: '2000-01-01', at }), { eligible: true });
  assert.deepEqual(adultCheckoutEligibility({ birthDate: '2010-01-01', at }), { eligible: false, reason: 'MINOR_NOT_SUPPORTED' });
  assert.deepEqual(adultCheckoutEligibility({ birthDate: null, at }), { eligible: false, reason: 'UNKNOWN_AGE' });
});

test('subscription credits expire at the end of the following calendar period', () => {
  assert.equal(
    subscriptionCreditExpiresAt(new Date('2026-02-28T10:30:00Z')).toISOString(),
    '2026-03-28T10:30:00.000Z'
  );
  assert.equal(
    subscriptionCreditExpiresAt(new Date('2027-01-31T10:30:00Z')).toISOString(),
    '2027-02-28T10:30:00.000Z'
  );
});

test('rollover is representable for one generation and rejects a second', () => {
  assert.equal(assertRolloverGeneration(0), 0);
  assert.equal(assertRolloverGeneration(1), 1);
  assert.throws(() => assertRolloverGeneration(2), /ROLLOVER_LIMIT_EXCEEDED/);
});

const availableCredit = (expiresAt = new Date('2026-10-01T00:00:00Z')) => ({
  status: 'available' as const,
  expiresAt,
  bookingId: null,
  reservedAt: null,
  consumedAt: null,
});

test('AVAILABLE becomes RESERVED for one valid booking', () => {
  const now = new Date('2026-09-21T12:00:00Z');
  const result = reserveCredit(availableCredit(), { bookingId: 44, now });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.credit.status, 'reserved');
    assert.equal(result.credit.bookingId, 44);
    assert.equal(result.credit.reservedAt, now);
  }
});

test('RESERVED becomes CONSUMED when the session completes', () => {
  const reserved = reserveCredit(availableCredit(), { bookingId: 44, now: new Date('2026-09-21T12:00:00Z') });
  assert.equal(reserved.ok, true);
  if (!reserved.ok) return;
  const completed = settleReservedCredit(reserved.credit, { outcome: 'session_completed', now: new Date('2026-09-28T13:00:00Z') });
  assert.equal(completed.ok, true);
  if (completed.ok) assert.equal(completed.credit.status, 'consumed');
});

test('valid athlete cancellation releases RESERVED back to AVAILABLE', () => {
  const reserved = reserveCredit(availableCredit(), { bookingId: 44, now: new Date('2026-09-20T12:00:00Z') });
  assert.equal(reserved.ok, true);
  if (!reserved.ok) return;
  assert.equal(athleteCancellationOutcome({ scheduledFor: new Date('2026-09-22T12:00:00Z'), cancelledAt: new Date('2026-09-21T12:00:00Z') }), 'athlete_cancelled_in_time');
  const released = settleReservedCredit(reserved.credit, { outcome: 'athlete_cancelled_in_time', now: new Date('2026-09-21T12:00:00Z') });
  assert.equal(released.ok, true);
  if (released.ok) assert.deepEqual({ status: released.credit.status, bookingId: released.credit.bookingId }, { status: 'available', bookingId: null });
});

test('late athlete cancellation consumes the reservation', () => {
  const reserved = reserveCredit(availableCredit(), { bookingId: 44, now: new Date('2026-09-20T12:00:00Z') });
  assert.equal(reserved.ok, true);
  if (!reserved.ok) return;
  assert.equal(athleteCancellationOutcome({ scheduledFor: new Date('2026-09-22T12:00:00Z'), cancelledAt: new Date('2026-09-21T12:00:01Z') }), 'athlete_cancelled_late');
  const consumed = settleReservedCredit(reserved.credit, { outcome: 'athlete_cancelled_late', now: new Date('2026-09-21T12:00:01Z') });
  assert.equal(consumed.ok && consumed.credit.status, 'consumed');
});

test('athlete no-show consumes the reservation', () => {
  const reserved = reserveCredit(availableCredit(), { bookingId: 44, now: new Date('2026-09-20T12:00:00Z') });
  assert.equal(reserved.ok, true);
  if (!reserved.ok) return;
  const consumed = settleReservedCredit(reserved.credit, { outcome: 'athlete_no_show', now: new Date('2026-09-22T13:00:00Z') });
  assert.equal(consumed.ok && consumed.credit.status, 'consumed');
});

test('coach cancellation always releases the reservation', () => {
  const reserved = reserveCredit(availableCredit(), { bookingId: 44, now: new Date('2026-09-20T12:00:00Z') });
  assert.equal(reserved.ok, true);
  if (!reserved.ok) return;
  const released = settleReservedCredit(reserved.credit, { outcome: 'coach_cancelled', now: new Date('2026-09-22T11:59:00Z') });
  assert.equal(released.ok && released.credit.status, 'available');
});

test('double reservation is rejected', () => {
  const first = reserveCredit(availableCredit(), { bookingId: 44, now: new Date('2026-09-20T12:00:00Z') });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.deepEqual(reserveCredit(first.credit, { bookingId: 45, now: new Date('2026-09-20T12:01:00Z') }), { ok: false, error: 'CREDIT_NOT_AVAILABLE' });
});

test('a consumed credit cannot reopen', () => {
  const reserved = reserveCredit(availableCredit(), { bookingId: 44, now: new Date('2026-09-20T12:00:00Z') });
  assert.equal(reserved.ok, true);
  if (!reserved.ok) return;
  const consumed = settleReservedCredit(reserved.credit, { outcome: 'session_completed', now: new Date('2026-09-22T13:00:00Z') });
  assert.equal(consumed.ok, true);
  if (!consumed.ok) return;
  assert.deepEqual(settleReservedCredit(consumed.credit, { outcome: 'coach_cancelled', now: new Date('2026-09-22T14:00:00Z') }), { ok: false, error: 'CREDIT_NOT_RESERVED' });
});

test('an expired credit cannot reserve and AVAILABLE expires server-side', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  assert.deepEqual(reserveCredit(availableCredit(now), { bookingId: 44, now }), { ok: false, error: 'CREDIT_EXPIRED' });
  const expired = expireAvailableCredit(availableCredit(now), now);
  assert.equal(expired.ok && expired.credit.status, 'expired');
});

test('single and extra credits expire exactly 60 days after grant', () => {
  const grantedAt = new Date('2026-09-21T12:00:00Z');
  assert.equal(oneOffCreditExpiresAt('single', grantedAt).toISOString(), '2026-11-20T12:00:00.000Z');
  assert.equal(oneOffCreditExpiresAt('extra', grantedAt).toISOString(), '2026-11-20T12:00:00.000Z');
});

test('a valid RESERVED credit survives renewal and can complete after its expiry', () => {
  const reserved = reserveCredit(availableCredit(new Date('2026-10-01T00:00:00Z')), { bookingId: 44, now: new Date('2026-09-30T23:00:00Z') });
  assert.equal(reserved.ok, true);
  if (!reserved.ok) return;
  const completed = settleReservedCredit(reserved.credit, { outcome: 'session_completed', now: new Date('2026-10-10T13:00:00Z') });
  assert.equal(completed.ok && completed.credit.status, 'consumed');
});

test('existing subscription keeps its original price after coach rate changes', () => {
  const original = newSubscriptionPriceSnapshot({ plan: 'essential', currentCoachRateCents: 7000, source: 'KAIPAI_SOURCED' });
  const renewed = renewalPriceSnapshot(original);
  assert.equal(renewed.coachRateCents, 7000);
  assert.equal(renewed.grossAmountCents, 14000);
});

test('new purchase uses the new coach rate', () => {
  const purchase = newSubscriptionPriceSnapshot({ plan: 'essential', currentCoachRateCents: 8000, source: 'KAIPAI_SOURCED' });
  assert.equal(purchase.grossAmountCents, 16000);
});

test('cancelled subscription followed by a new one uses the current coach rate', () => {
  const oldSubscription = newSubscriptionPriceSnapshot({ plan: 'essential', currentCoachRateCents: 7000, source: 'KAIPAI_SOURCED' });
  const newSubscription = newSubscriptionPriceSnapshot({ plan: 'essential', currentCoachRateCents: 8000, source: 'KAIPAI_SOURCED' });
  assert.equal(oldSubscription.grossAmountCents, 14000);
  assert.equal(newSubscription.grossAmountCents, 16000);
});

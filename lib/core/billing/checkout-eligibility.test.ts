import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkoutEligibility,
  type CheckoutEligibilityInput,
} from './checkout-eligibility';

const at = new Date('2026-10-06T12:00:00Z');

const valid: CheckoutEligibilityInput = {
  viewer: { userId: 10, isAthlete: true, isDemo: false, birthDate: '1990-05-20' },
  coachUserId: 83,
  coachState: 'active',
  plan: { status: 'active', coachUserId: 83 },
  hasLiveSubscriptionWithCoach: false,
  at,
};

function reasonFor(patch: Partial<CheckoutEligibilityInput>) {
  const result = checkoutEligibility({ ...valid, ...patch });
  return result.ok ? 'OK' : result.reason;
}

describe('checkoutEligibility', () => {
  it('un atleta adulto, un coach attivo e un piano attivo: si può', () => {
    assert.deepEqual(checkoutEligibility(valid), { ok: true });
  });

  it('solo un atleta', () => {
    assert.equal(
      reasonFor({ viewer: { ...valid.viewer, isAthlete: false } }),
      'NOT_ATHLETE'
    );
  });

  it('un account demo non compra', () => {
    assert.equal(
      reasonFor({ viewer: { ...valid.viewer, isDemo: true } }),
      'DEMO_ACCOUNT'
    );
  });

  it('non ci si abbona a se stessi', () => {
    assert.equal(
      reasonFor({ viewer: { ...valid.viewer, userId: 83 } }),
      'SELF_PURCHASE'
    );
  });

  it('il coach deve poter incassare', () => {
    for (const coachState of ['off', 'kyc_required', 'kyc_in_progress', 'restricted'] as const) {
      assert.equal(reasonFor({ coachState }), 'COACH_NOT_ACTIVE', coachState);
    }
  });

  it('il piano deve esistere, essere attivo ed essere di questo coach', () => {
    assert.equal(reasonFor({ plan: null }), 'PLAN_UNAVAILABLE');
    assert.equal(
      reasonFor({ plan: { status: 'draft', coachUserId: 83 } }),
      'PLAN_UNAVAILABLE'
    );
    assert.equal(
      reasonFor({ plan: { status: 'archived', coachUserId: 83 } }),
      'PLAN_UNAVAILABLE'
    );
    // Piano di un altro coach, passato dal browser con l'id di questo.
    assert.equal(
      reasonFor({ plan: { status: 'active', coachUserId: 999 } }),
      'PLAN_UNAVAILABLE'
    );
  });

  it('un’età sconosciuta blocca: non vale «non richiesto»', () => {
    for (const birthDate of [null, undefined, '', 'non-una-data']) {
      assert.equal(
        reasonFor({ viewer: { ...valid.viewer, birthDate } }),
        'UNKNOWN_AGE',
        String(birthDate)
      );
    }
  });

  it('un minorenne non compra, nemmeno a 17 anni e 364 giorni', () => {
    assert.equal(
      reasonFor({ viewer: { ...valid.viewer, birthDate: '2009-10-07' } }),
      'MINOR_NOT_SUPPORTED'
    );
    assert.equal(
      reasonFor({ viewer: { ...valid.viewer, birthDate: '2012-01-01' } }),
      'MINOR_NOT_SUPPORTED'
    );
  });

  it('il giorno del diciottesimo compleanno si può', () => {
    assert.equal(
      reasonFor({ viewer: { ...valid.viewer, birthDate: '2008-10-06' } }),
      'OK'
    );
  });

  it('un solo abbonamento vivo per coach', () => {
    assert.equal(
      reasonFor({ hasLiveSubscriptionWithCoach: true }),
      'ALREADY_SUBSCRIBED'
    );
  });

  it('il rifiuto porta già il messaggio in italiano per l’atleta', () => {
    const result = checkoutEligibility({
      ...valid,
      viewer: { ...valid.viewer, birthDate: null },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /data di nascita/);
  });
});

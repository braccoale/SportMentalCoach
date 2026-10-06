import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  athleteCanSeePlans,
  athleteCanSeePricing,
  canCharge,
  coachCanEditPlans,
  coachPaymentsState,
  coachSeesPaymentsSection,
  type CoachPaymentsProfile,
} from './coach-payments';

const verified: CoachPaymentsProfile = {
  paymentsEnabled: true,
  onboardingStatus: 'active',
  chargesEnabled: true,
  payoutsEnabled: true,
};

describe('coachPaymentsState', () => {
  it('senza profilo i pagamenti sono spenti: la piattaforma resta com’è', () => {
    assert.equal(coachPaymentsState(null), 'off');
    assert.equal(coachPaymentsState(undefined), 'off');
  });

  it('spento dall’admin è spento, anche se Stripe dice che è tutto a posto', () => {
    assert.equal(coachPaymentsState({ ...verified, paymentsEnabled: false }), 'off');
  });

  it('attivato dall’admin ma verifica non iniziata: serve il KYC', () => {
    assert.equal(
      coachPaymentsState({
        paymentsEnabled: true,
        onboardingStatus: 'not_started',
        chargesEnabled: false,
        payoutsEnabled: false,
      }),
      'kyc_required'
    );
  });

  it('verifica iniziata ma incompleta', () => {
    assert.equal(
      coachPaymentsState({
        paymentsEnabled: true,
        onboardingStatus: 'pending',
        chargesEnabled: false,
        payoutsEnabled: false,
      }),
      'kyc_in_progress'
    );
  });

  it('attivo solo con incassi e bonifici entrambi abilitati', () => {
    assert.equal(coachPaymentsState(verified), 'active');
    assert.equal(
      coachPaymentsState({ ...verified, payoutsEnabled: false }),
      'kyc_in_progress'
    );
    assert.equal(
      coachPaymentsState({ ...verified, chargesEnabled: false }),
      'kyc_in_progress'
    );
  });

  it('un account limitato o disabilitato da Stripe non è attivo', () => {
    assert.equal(
      coachPaymentsState({ ...verified, onboardingStatus: 'restricted' }),
      'restricted'
    );
    assert.equal(
      coachPaymentsState({ ...verified, onboardingStatus: 'disabled' }),
      'restricted'
    );
  });

  it('uno stato sconosciuto si chiude: non diventa mai attivo', () => {
    assert.equal(
      coachPaymentsState({ ...verified, onboardingStatus: 'qualcosa_di_nuovo' }),
      'kyc_required'
    );
  });
});

describe('che cosa vede chi', () => {
  it('il coach vede le sezioni nuove solo se attivato', () => {
    assert.equal(coachSeesPaymentsSection('off'), false);
    for (const s of ['kyc_required', 'kyc_in_progress', 'restricted', 'active'] as const) {
      assert.equal(coachSeesPaymentsSection(s), true, s);
      assert.equal(coachCanEditPlans(s), true, s);
    }
    assert.equal(coachCanEditPlans('off'), false);
  });

  it('l’atleta vede prezzi e acquista solo con il coach attivo', () => {
    assert.equal(athleteCanSeePricing('active'), true);
    for (const s of ['off', 'kyc_required', 'kyc_in_progress', 'restricted'] as const) {
      assert.equal(athleteCanSeePricing(s), false, s);
      assert.equal(canCharge(s), false, s);
    }
    assert.equal(canCharge('active'), true);
  });
});

describe('athleteCanSeePlans', () => {
  it('serve un atleta con un account E un coach attivo', () => {
    assert.equal(athleteCanSeePlans('active', { isAthlete: true }), true);
  });

  it('un visitatore o un non-atleta non vede i prezzi, nemmeno con il coach attivo', () => {
    assert.equal(athleteCanSeePlans('active', { isAthlete: false }), false);
  });

  it('un atleta non vede i prezzi di un coach che non può incassare', () => {
    for (const s of ['off', 'kyc_required', 'kyc_in_progress', 'restricted'] as const) {
      assert.equal(athleteCanSeePlans(s, { isAthlete: true }), false, s);
    }
  });
});

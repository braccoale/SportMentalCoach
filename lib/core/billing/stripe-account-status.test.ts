import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UNKNOWN_REQUIREMENT_LABEL,
  deriveBillingProfileFromStripeAccount,
  describeRequirement,
  describeRequirements,
  outstandingRequirements,
  type StripeAccountSnapshot,
} from './stripe-account-status';

// Forma presa da un account v2 reale in modalità test, appena creato.
const justCreated: StripeAccountSnapshot = {
  closed: false,
  configuration: {
    merchant: {
      capabilities: { card_payments: { status: 'restricted' } },
    },
  },
  requirements: {
    entries: [
      { awaiting_action_from: 'user', description: 'configuration.merchant.mcc' },
      { awaiting_action_from: 'user', description: 'defaults.profile.business_url' },
      { awaiting_action_from: 'stripe', description: 'identity.review' },
    ],
  },
};

const fullyActive: StripeAccountSnapshot = {
  closed: false,
  configuration: {
    merchant: {
      capabilities: {
        card_payments: { status: 'active' },
        stripe_balance: { payouts: { status: 'active' } },
      },
    },
  },
  requirements: { entries: [] },
};

describe('outstandingRequirements', () => {
  it('conta solo ciò che aspetta il coach, senza doppioni', () => {
    const due = outstandingRequirements({
      requirements: {
        entries: [
          { awaiting_action_from: 'user', description: 'a' },
          { awaiting_action_from: 'user', description: 'a' },
          { awaiting_action_from: 'stripe', description: 'b' },
          { awaiting_action_from: 'user', description: '' },
        ],
      },
    });
    assert.deepEqual(due, ['a']);
  });

  it('non solleva se i requisiti mancano', () => {
    assert.deepEqual(outstandingRequirements({}), []);
    assert.deepEqual(outstandingRequirements({ requirements: null }), []);
  });
});

describe('deriveBillingProfileFromStripeAccount', () => {
  it('un account appena creato è in verifica, non attivo', () => {
    const result = deriveBillingProfileFromStripeAccount(justCreated, 'not_started');
    assert.equal(result.onboardingStatus, 'pending');
    assert.equal(result.chargesEnabled, false);
    assert.equal(result.payoutsEnabled, false);
    assert.deepEqual(result.requirementsDue, [
      'configuration.merchant.mcc',
      'defaults.profile.business_url',
    ]);
  });

  it('attivo con incassi e bonifici entrambi attivi', () => {
    const result = deriveBillingProfileFromStripeAccount(fullyActive, 'pending');
    assert.equal(result.onboardingStatus, 'active');
    assert.equal(result.chargesEnabled, true);
    assert.equal(result.payoutsEnabled, true);
  });

  it('incassi attivi ma bonifici ancora no: non è attivo', () => {
    const result = deriveBillingProfileFromStripeAccount(
      {
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { status: 'active' },
              stripe_balance: { payouts: { status: 'restricted' } },
            },
          },
        },
      },
      'pending'
    );
    assert.equal(result.chargesEnabled, true);
    assert.equal(result.payoutsEnabled, false);
    assert.equal(result.onboardingStatus, 'pending');
  });

  it('senza capacità bonifici si guarda se resta qualcosa da fornire', () => {
    const noPayoutCapability: StripeAccountSnapshot = {
      configuration: {
        merchant: { capabilities: { card_payments: { status: 'active' } } },
      },
      requirements: {
        entries: [{ awaiting_action_from: 'user', description: 'external_account' }],
      },
    };
    assert.equal(
      deriveBillingProfileFromStripeAccount(noPayoutCapability).payoutsEnabled,
      false
    );
    assert.equal(
      deriveBillingProfileFromStripeAccount({
        ...noPayoutCapability,
        requirements: { entries: [] },
      }).payoutsEnabled,
      true
    );
  });

  it('un account che funzionava e ora non più è limitato', () => {
    const result = deriveBillingProfileFromStripeAccount(justCreated, 'active');
    assert.equal(result.onboardingStatus, 'restricted');
  });

  it('un account chiuso o non supportato è disabilitato', () => {
    assert.equal(
      deriveBillingProfileFromStripeAccount({ ...fullyActive, closed: true }, 'active')
        .onboardingStatus,
      'disabled'
    );
    assert.equal(
      deriveBillingProfileFromStripeAccount({
        configuration: {
          merchant: { capabilities: { card_payments: { status: 'unsupported' } } },
        },
      }).onboardingStatus,
      'disabled'
    );
  });

  it('un payload vuoto o illeggibile non diventa mai attivo', () => {
    const result = deriveBillingProfileFromStripeAccount({}, 'pending');
    assert.equal(result.onboardingStatus, 'pending');
    assert.equal(result.chargesEnabled, false);
    assert.equal(result.payoutsEnabled, false);
  });
});

describe('describeRequirement', () => {
  it('traduce le voci note', () => {
    assert.equal(
      describeRequirement('identity.individual.verification.document'),
      'documento d’identità'
    );
    assert.equal(describeRequirement('identity.individual.dob'), 'data di nascita');
    assert.equal(
      describeRequirement('identity.individual.id_number'),
      'codice fiscale'
    );
    assert.equal(
      describeRequirement('defaults.profile.business_url'),
      'sito web o profilo pubblico'
    );
  });

  it('riconosce i percorsi che Stripe usa davvero per un coach italiano', () => {
    // Elenco preso da un account v2 reale in modalità test.
    const real = [
      'configuration.merchant.mcc',
      'configuration.merchant.support.phone',
      'external_account',
      'identity.attestations.terms_of_service.account.date',
      'identity.attestations.terms_of_service.account.ip',
      'identity.individual.address.city',
      'identity.individual.address.line1',
      'identity.individual.address.postal_code',
      'identity.individual.date_of_birth.day',
      'identity.individual.email',
      'identity.individual.given_name',
      'identity.individual.nationalities',
      'identity.individual.phone',
      'identity.individual.surname',
    ];
    for (const path of real) {
      assert.notEqual(
        describeRequirement(path),
        UNKNOWN_REQUIREMENT_LABEL,
        `${path} non è riconosciuto`
      );
    }
    assert.deepEqual(describeRequirements(real), [
      'categoria dell’attività',
      'numero di telefono',
      'IBAN del conto per i bonifici',
      'accettazione dei termini di Stripe',
      'indirizzo',
      'data di nascita',
      'indirizzo email',
      'nome e cognome',
      'cittadinanza',
    ]);
  });

  it('una voce sconosciuta non sparisce', () => {
    assert.equal(describeRequirement('qualcosa.di.nuovo'), UNKNOWN_REQUIREMENT_LABEL);
  });

  it('elenca senza doppioni', () => {
    assert.deepEqual(
      describeRequirements([
        'identity.individual.address.line1',
        'identity.individual.address.city',
        'identity.individual.dob',
      ]),
      ['indirizzo', 'data di nascita']
    );
  });
});

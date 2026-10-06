import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NOBODY,
  participantPresence,
  transcriptionConsentFrom,
} from './session-presence';

describe('transcriptionConsentFrom', () => {
  it('traduce gli stati del consenso', () => {
    assert.equal(transcriptionConsentFrom('accepted'), 'accepted');
    assert.equal(transcriptionConsentFrom('rejected'), 'declined');
    assert.equal(transcriptionConsentFrom('revoked'), 'declined');
    assert.equal(transcriptionConsentFrom('pending'), 'pending');
  });

  it('nessuna riga o uno stato sconosciuto non mostrano niente', () => {
    for (const status of [null, undefined, '', 'boh']) {
      assert.equal(transcriptionConsentFrom(status), 'none', String(status));
    }
  });

  it('uno stato sconosciuto non diventa mai «accettato»', () => {
    assert.notEqual(transcriptionConsentFrom('ACCEPTED'), 'accepted');
  });
});

describe('participantPresence', () => {
  const joined = new Set(['abc', 'def']);

  it('è entrato se il suo riferimento è tra quelli registrati', () => {
    assert.deepEqual(
      participantPresence({ joinedRefs: joined, ref: 'abc', consentStatus: 'accepted' }),
      { joined: true, consent: 'accepted' }
    );
  });

  it('non è entrato se non compare, e il consenso resta indipendente', () => {
    assert.deepEqual(
      participantPresence({ joinedRefs: joined, ref: 'zzz', consentStatus: 'accepted' }),
      { joined: false, consent: 'accepted' }
    );
  });

  it('senza riferimento non si può dire che sia entrato', () => {
    assert.equal(
      participantPresence({ joinedRefs: joined, ref: null, consentStatus: null }).joined,
      false
    );
  });

  it('un insieme vuoto non fa entrare nessuno', () => {
    assert.deepEqual(
      participantPresence({ joinedRefs: new Set(), ref: 'abc', consentStatus: undefined }),
      NOBODY
    );
  });
});

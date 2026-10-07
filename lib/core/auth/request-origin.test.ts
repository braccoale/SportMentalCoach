import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { originFromHeaders } from './request-origin';

describe('originFromHeaders', () => {
  it('preferisce l’intestazione Origin', () => {
    assert.equal(
      originFromHeaders({ origin: 'https://www.kaipaicoaching.com', host: 'x.vercel.app' }),
      'https://www.kaipaicoaching.com'
    );
  });
  it('senza Origin usa l’host inoltrato e il protocollo', () => {
    assert.equal(
      originFromHeaders({ forwardedHost: 'www.kaipaicoaching.com', forwardedProto: 'https' }),
      'https://www.kaipaicoaching.com'
    );
  });
  it('senza protocollo presume https; con più valori prende il primo', () => {
    assert.equal(originFromHeaders({ host: 'www.kaipaicoaching.com' }), 'https://www.kaipaicoaching.com');
    assert.equal(
      originFromHeaders({ forwardedHost: 'a.com, b.com', forwardedProto: 'https, http' }),
      'https://a.com'
    );
  });
  it('un’origine malformata ripiega sull’host', () => {
    assert.equal(originFromHeaders({ origin: 'non-un-url', host: 'www.kaipaicoaching.com' }), 'https://www.kaipaicoaching.com');
  });
  it('senza niente non inventa un indirizzo', () => {
    assert.equal(originFromHeaders({}), null);
    assert.equal(originFromHeaders({ origin: '', host: '' }), null);
  });
});

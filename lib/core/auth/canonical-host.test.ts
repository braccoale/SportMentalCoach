import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalRedirectTarget } from './canonical-host';

const base = {
  host: 'sport-mental-coach-arge-kaipai.vercel.app',
  pathname: '/dashboard/athlete',
  search: '?abbonamento=ok',
  method: 'GET',
  vercelEnv: 'production',
  canonicalOrigin: 'https://www.kaipaicoaching.com',
};

describe('canonicalRedirectTarget', () => {
  it('porta le pagine di vercel.app sul dominio vero, mantenendo percorso e parametri', () => {
    assert.equal(
      canonicalRedirectTarget(base),
      'https://www.kaipaicoaching.com/dashboard/athlete?abbonamento=ok'
    );
  });

  it('non tocca il dominio vero né gli altri domini', () => {
    for (const host of ['www.kaipaicoaching.com', 'kaipaicoaching.com', 'localhost:3000', null, undefined]) {
      assert.equal(canonicalRedirectTarget({ ...base, host }), null, String(host));
    }
  });

  it('non tocca le anteprime né lo sviluppo', () => {
    assert.equal(canonicalRedirectTarget({ ...base, vercelEnv: 'preview' }), null);
    assert.equal(canonicalRedirectTarget({ ...base, vercelEnv: 'development' }), null);
    assert.equal(canonicalRedirectTarget({ ...base, vercelEnv: undefined }), null);
  });

  it('non tocca mai le API (webhook e lavori programmati) né i file di Next', () => {
    for (const pathname of ['/api/payments/webhook', '/api/internal/ai-notes/process', '/api', '/_next/static/x.js']) {
      assert.equal(canonicalRedirectTarget({ ...base, pathname }), null, pathname);
    }
  });

  it('solo per gli accessi di lettura: una scrittura non si reindirizza', () => {
    assert.equal(canonicalRedirectTarget({ ...base, method: 'POST' }), null);
    assert.notEqual(canonicalRedirectTarget({ ...base, method: 'HEAD' }), null);
  });

  it('un percorso che somiglia a /api ma non lo è si reindirizza', () => {
    assert.notEqual(canonicalRedirectTarget({ ...base, pathname: '/apiario' }), null);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ttlMemo } from './ttl-memo';

describe('ttlMemo', () => {
  it('rilegge solo dopo la scadenza', async () => {
    let clock = 0;
    let reads = 0;
    const get = ttlMemo(async () => ++reads, 1000, () => clock);
    assert.equal(await get(), 1);
    clock = 999;
    assert.equal(await get(), 1);
    clock = 1000;
    assert.equal(await get(), 2);
    assert.equal(reads, 2);
  });

  it('due richieste vicine condividono la stessa lettura', async () => {
    let reads = 0;
    const get = ttlMemo(
      async () => {
        reads++;
        await new Promise((r) => setTimeout(r, 10));
        return reads;
      },
      1000
    );
    const [a, b] = await Promise.all([get(), get()]);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(reads, 1);
  });

  it('una lettura fallita non si ricorda', async () => {
    let attempts = 0;
    const get = ttlMemo(async () => {
      attempts++;
      if (attempts === 1) throw new Error('giù');
      return attempts;
    }, 1000);
    await assert.rejects(get(), /giù/);
    assert.equal(await get(), 2);
  });
});

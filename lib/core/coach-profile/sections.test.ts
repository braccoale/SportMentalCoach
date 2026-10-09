import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeProfileCompleteness } from './completeness';
import { sectionsNeedingAttention, targetForItem } from './sections';

const empty = computeProfileCompleteness({
  hasPhoto: false,
  headline: null,
  description: null,
  categories: null,
  specialties: null,
  athleteLevels: null,
  languages: null,
  coachSince: null,
  yearsExperience: null,
  certifications: null,
  hasVideo: false,
  hasService: false,
  hasPricedService: false,
  hasAvailability: false,
});

describe('sezioni del profilo', () => {
  it('ogni voce della completezza ha una destinazione', () => {
    for (const item of empty.items) {
      assert.ok(targetForItem(item.key), `la voce «${item.key}» non ha una destinazione`);
    }
  });
  it('un profilo vuoto ha da completare Presentazione e Competenze, non Account', () => {
    const s = sectionsNeedingAttention(empty.items);
    assert.ok(s.has('presentazione') && s.has('competenze'));
    assert.equal(s.has('account'), false);
  });
  it('senza voci da completare nessuna sezione ha il puntino', () => {
    const done = empty.items.map((i) => ({ key: i.key, state: 'done' as const }));
    assert.equal(sectionsNeedingAttention(done).size, 0);
  });
  it('servizi e orari portano a un’altra pagina e non accendono nessuna sezione', () => {
    assert.deepEqual(targetForItem('service'), { href: '/dashboard/coach/services' });
    assert.equal(sectionsNeedingAttention([{ key: 'service', state: 'missing' }, { key: 'availability', state: 'missing' }]).size, 0);
  });
});

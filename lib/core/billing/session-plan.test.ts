import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_PLAN_LIMITS,
  PLAN_ACCENTS,
  canActivateAnotherPlan,
  defaultSelectedPlanId,
  formatEuroCents,
  parseEuroToCents,
  perSessionCents,
  planAccentForPosition,
  validateSessionPlan,
} from './session-plan';

describe('parseEuroToCents', () => {
  it('legge gli importi come li scrive un italiano', () => {
    assert.equal(parseEuroToCents('120'), 12000);
    assert.equal(parseEuroToCents('120,5'), 12050);
    assert.equal(parseEuroToCents('120,50'), 12050);
    assert.equal(parseEuroToCents('119.90'), 11990);
    assert.equal(parseEuroToCents('1.200,00'), 120000);
    assert.equal(parseEuroToCents('1,200.00'), 120000);
    assert.equal(parseEuroToCents(' 80 € '), 8000);
  });

  it('non passa dalla virgola mobile: 19,99 sono 1999 centesimi', () => {
    assert.equal(parseEuroToCents('19,99'), 1999);
    assert.equal(parseEuroToCents('0,07'), 7);
  });

  it('rifiuta ciò che non è un importo', () => {
    for (const bad of ['', '  ', 'abc', '-5', '12,345', '12,', ',50', '1e3', '12 euro']) {
      assert.equal(parseEuroToCents(bad), null, JSON.stringify(bad));
    }
  });
});

describe('formatEuroCents', () => {
  it('formatta senza dipendere dall’ICU del runtime', () => {
    assert.equal(formatEuroCents(12000), '120,00 €');
    assert.equal(formatEuroCents(11990), '119,90 €');
    assert.equal(formatEuroCents(5), '0,05 €');
    assert.equal(formatEuroCents(123456789), '1.234.567,89 €');
  });
});

describe('perSessionCents', () => {
  it('divide arrotondando al centesimo', () => {
    assert.equal(perSessionCents(12000, 4), 3000);
    assert.equal(perSessionCents(10000, 3), 3333);
  });
  it('rifiuta zero sedute', () => {
    assert.throws(() => perSessionCents(1000, 0), /INVALID_SESSIONS/);
  });
});

describe('validateSessionPlan', () => {
  it('accetta un piano valido e normalizza il nome', () => {
    const result = validateSessionPlan({
      name: '  Percorso   mensile ',
      sessionsPerMonth: '4',
      monthlyPrice: '240,00',
    });
    assert.deepEqual(result, {
      ok: true,
      value: {
        name: 'Percorso mensile',
        description: null,
        recommended: false,
        sessionsPerMonth: 4,
        monthlyPriceCents: 24000,
      },
    });
  });

  it('riporta tutti gli errori insieme, non uno alla volta', () => {
    const result = validateSessionPlan({
      name: '',
      sessionsPerMonth: 'molte',
      monthlyPrice: 'gratis',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(Object.keys(result.errors).sort(), [
        'monthlyPrice',
        'name',
        'sessionsPerMonth',
      ]);
    }
  });

  it('rispetta i limiti passati dal chiamante', () => {
    const limits = { ...DEFAULT_PLAN_LIMITS, maxSessions: 4, minPriceCents: 5000 };
    const tooMany = validateSessionPlan(
      { name: 'x', sessionsPerMonth: 5, monthlyPrice: '100' },
      limits
    );
    assert.equal(tooMany.ok, false);
    const tooCheap = validateSessionPlan(
      { name: 'x', sessionsPerMonth: 2, monthlyPrice: '40' },
      limits
    );
    assert.equal(tooCheap.ok, false);
    const fine = validateSessionPlan(
      { name: 'x', sessionsPerMonth: 4, monthlyPrice: '50' },
      limits
    );
    assert.equal(fine.ok, true);
  });

  it('non accetta sedute decimali, zero o negative', () => {
    for (const sessionsPerMonth of ['1.5', '0', '-2', 2.5, 0]) {
      const result = validateSessionPlan({
        name: 'x',
        sessionsPerMonth,
        monthlyPrice: '100',
      });
      assert.equal(result.ok, false, String(sessionsPerMonth));
    }
  });

  it('rifiuta un nome troppo lungo', () => {
    const result = validateSessionPlan({
      name: 'a'.repeat(81),
      sessionsPerMonth: 2,
      monthlyPrice: '100',
    });
    assert.equal(result.ok, false);
  });
});

describe('canActivateAnotherPlan', () => {
  it('si ferma al tetto', () => {
    assert.equal(canActivateAnotherPlan(4), true);
    assert.equal(canActivateAnotherPlan(5), false);
  });
});

describe('descrizione e consigliato', () => {
  it('la frase è facoltativa, si normalizza e il consigliato è un booleano', () => {
    const result = validateSessionPlan({
      name: 'Beginner',
      description: '  Il più scelto   per un percorso continuativo ',
      recommended: true,
      sessionsPerMonth: 3,
      monthlyPrice: '300',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.description, 'Il più scelto per un percorso continuativo');
      assert.equal(result.value.recommended, true);
    }
  });

  it('una frase vuota diventa assente, una troppo lunga è rifiutata', () => {
    const empty = validateSessionPlan({
      name: 'x', description: '   ', sessionsPerMonth: 2, monthlyPrice: '100',
    });
    assert.equal(empty.ok && empty.value.description, null);
    const long = validateSessionPlan({
      name: 'x', description: 'a'.repeat(121), sessionsPerMonth: 2, monthlyPrice: '100',
    });
    assert.equal(long.ok, false);
  });
});

describe('planAccentForPosition', () => {
  it('un colore fisso per posizione, che riparte dopo il quarto', () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5].map(planAccentForPosition),
      ['blue', 'emerald', 'violet', 'orange', 'blue', 'emerald']
    );
    assert.equal(PLAN_ACCENTS.length, 4);
  });
  it('una posizione impossibile non rompe niente', () => {
    assert.equal(planAccentForPosition(-1), 'blue');
    assert.equal(planAccentForPosition(1.5), 'blue');
  });
});

describe('defaultSelectedPlanId', () => {
  it('preseleziona il consigliato, altrimenti il primo', () => {
    assert.equal(defaultSelectedPlanId([{ id: 1, isRecommended: false }, { id: 2, isRecommended: true }]), 2);
    assert.equal(defaultSelectedPlanId([{ id: 7, isRecommended: false }, { id: 8, isRecommended: false }]), 7);
    assert.equal(defaultSelectedPlanId([]), null);
  });
});

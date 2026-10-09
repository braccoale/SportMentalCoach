import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { RATE_CONFIG_KEYS, rateConfigKey, rateConfigRows, resolveRateLevels } from './config';
import { RATE_LEVELS, suggestRate } from './index';

describe('resolveRateLevels', () => {
  it('senza nessuna riga valgono i predefiniti', () => {
    assert.deepEqual(resolveRateLevels({}), RATE_LEVELS);
  });
  it('un valore valido cambia solo quella fascia', () => {
    const levels = resolveRateLevels({ [rateConfigKey.suggested('esperto')]: 95, [rateConfigKey.max('esperto')]: 120 });
    const esperto = levels.find((l) => l.key === 'esperto')!;
    assert.equal(esperto.suggested, 95);
    assert.equal(esperto.max, 120);
    assert.equal(esperto.min, 75);
    assert.equal(levels.find((l) => l.key === 'avvio')!.suggested, 50);
  });
  it('un valore incoerente riporta tutto ai predefiniti, non mezza tabella', () => {
    // suggerito sopra il massimo
    assert.deepEqual(resolveRateLevels({ [rateConfigKey.suggested('avvio')]: 99 }), RATE_LEVELS);
    // soglie che non crescono
    assert.deepEqual(resolveRateLevels({ [rateConfigKey.minScore('esperto')]: 20 }), RATE_LEVELS);
    // un livello che scende sotto il precedente
    assert.deepEqual(
      resolveRateLevels({ [rateConfigKey.min('esperto')]: 10, [rateConfigKey.suggested('esperto')]: 20, [rateConfigKey.max('esperto')]: 70 }),
      RATE_LEVELS
    );
  });
  it('valori non numerici, zero o negativi si ignorano', () => {
    assert.deepEqual(resolveRateLevels({ [rateConfigKey.max('senior')]: 0, [rateConfigKey.min('avvio')]: -5 }), RATE_LEVELS);
    assert.deepEqual(resolveRateLevels({ [rateConfigKey.max('senior')]: Number.NaN }), RATE_LEVELS);
  });
  it('le fasce nuove arrivano al calcolo del suggerimento', () => {
    const input = {
      yearsExperience: 5, totalMinutes: 0, athletesCount: 0, ratingAverage: null, ratingCount: 0,
      certificationsCount: 0, certificationsVerified: false, athleteLevels: [],
    };
    // 5 anni = 10 punti su 75 disponibili (la valutazione non conta ancora): punteggio 13.
    assert.equal(suggestRate(input).score, 13);
    assert.equal(suggestRate(input).level.key, 'avvio'); // soglia predefinita: 30
    const levels = resolveRateLevels({ [rateConfigKey.minScore('consolidato')]: 10 });
    assert.equal(suggestRate(input, levels).level.key, 'consolidato');
  });
});

describe('righe di configurazione', () => {
  it('sono quindici e le chiavi sono tutte diverse', () => {
    assert.equal(rateConfigRows().length, 15);
    assert.equal(new Set(RATE_CONFIG_KEYS).size, 15);
  });
  it('la migrazione inserisce le stesse righe, con gli stessi valori dei predefiniti del codice', () => {
    const sql = readFileSync(new URL('../../db/migrations/0099_fasce-tariffa-suggerita.sql', import.meta.url), 'utf8');
    for (const row of rateConfigRows()) {
      assert.ok(
        sql.includes(`('${row.key}', '${row.defaultValue}'::jsonb, 'number', 'tariffe'`),
        `${row.key} = ${row.defaultValue} non è nella migrazione`
      );
    }
    assert.equal((sql.match(/'number', 'tariffe'/g) ?? []).length, 15);
  });
});

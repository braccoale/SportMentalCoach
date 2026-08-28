import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COACHING_PACKAGES, formatPackagePrice } from './index';
import { renderPricingMarkdown } from './markdown';

/**
 * Il listino ha due lettori — la sezione «Pacchetti» della landing e
 * `/pricing.md` — e un solo modo di sbagliare che nessuno noterebbe: che i due
 * dicano cifre diverse.
 *
 * Il rischio concreto e' l'unita' di misura. Nel prodotto i soldi sono in
 * centesimi ovunque (`formatPrice` divide per cento); un `1500` scritto qui
 * pensando agli euro diventerebbe «15,00 €» sulla landing e nel file che gli
 * agenti leggono, senza rompere nulla. Questi test bloccano esattamente quello.
 */

/**
 * `Intl` separa cifra e simbolo con uno spazio unificatore (U+00A0), non con
 * uno spazio normale. Confrontarlo alla lettera legherebbe il test alla
 * versione di ICU installata; qui interessa la cifra, non quel byte.
 */
function amountOf(key: string): string {
  const pkg = COACHING_PACKAGES.find((p) => p.key === key);
  assert.ok(pkg, `pacchetto ${key} assente dal listino`);
  return formatPackagePrice(pkg).amount.replace(/ /g, ' ');
}

test('gli importi sono in centesimi e si leggono come sulla landing', () => {
  assert.equal(amountOf('starter'), '1.500 €');
  assert.equal(amountOf('academy'), '3.500 €');
  assert.equal(amountOf('elite'), '75.000 €');
});

test('il periodo distingue il canone mensile da quello annuale', () => {
  const byKey = Object.fromEntries(COACHING_PACKAGES.map((p) => [p.key, p]));

  assert.equal(formatPackagePrice(byKey.starter).period, '/ mese');
  assert.equal(formatPackagePrice(byKey.elite).period, '/ anno');
});

test('un solo pacchetto e’ messo in evidenza', () => {
  const highlighted = COACHING_PACKAGES.filter((p) => p.highlighted);

  assert.equal(highlighted.length, 1);
  assert.equal(highlighted[0].key, 'academy');
});

test('pricing.md riporta tutti i pacchetti con la loro cifra', () => {
  const markdown = renderPricingMarkdown();

  for (const pkg of COACHING_PACKAGES) {
    assert.ok(
      markdown.includes(pkg.name),
      `manca il pacchetto ${pkg.name} in pricing.md`
    );
    assert.ok(
      markdown.includes(formatPackagePrice(pkg).amount),
      `manca il prezzo di ${pkg.name} in pricing.md`
    );
  }
});

test('pricing.md dichiara che le tariffe dei coach non sono a listino', () => {
  const markdown = renderPricingMarkdown();

  assert.ok(
    /non pubblicat|non sono esposte/i.test(markdown),
    'il file deve dire cosa NON espone, o un modello inventera’ una cifra'
  );
});

test('pricing.md e’ markdown con un solo titolo di primo livello', () => {
  const markdown = renderPricingMarkdown();
  const h1 = markdown.split('\n').filter((line) => line.startsWith('# '));

  assert.deepEqual(h1, ['# Prezzi — KaiPai']);
});

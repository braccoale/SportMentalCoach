import assert from 'node:assert/strict';
import test from 'node:test';
import { safeRedirectPath } from './safe-redirect';

test('un percorso interno passa', () => {
  assert.equal(safeRedirectPath('/coaches/mario-rossi'), '/coaches/mario-rossi');
  assert.equal(safeRedirectPath('/dashboard?tab=1'), '/dashboard?tab=1');
});

test('niente e vuoto non sono una destinazione', () => {
  assert.equal(safeRedirectPath(null), null);
  assert.equal(safeRedirectPath(undefined), null);
  assert.equal(safeRedirectPath(''), null);
});

test('un indirizzo assoluto non passa', () => {
  assert.equal(safeRedirectPath('https://esempio.test/login'), null);
  assert.equal(safeRedirectPath('http://esempio.test'), null);
});

/**
 * Le due scritture che sembrano un percorso interno e non lo sono. Il browser
 * legge `//esempio.test` come indirizzo assoluto con lo stesso protocollo, e
 * alcuni normalizzano `/\` in `//`.
 */
test('le finte barre iniziali non passano', () => {
  assert.equal(safeRedirectPath('//esempio.test'), null);
  assert.equal(safeRedirectPath('/\\esempio.test'), null);
});

test('uno schema senza barre non passa', () => {
  assert.equal(safeRedirectPath('javascript:alert(1)'), null);
  assert.equal(safeRedirectPath('mailto:qualcuno@esempio.test'), null);
});

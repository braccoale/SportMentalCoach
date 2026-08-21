import assert from 'node:assert/strict';
import test from 'node:test';
import { getFormatLocale, resolveFormatLocale } from './format-locale';
import {
  DEFAULT_LOCALE,
  ENABLED_LOCALES,
  LOCALE_DEFINITIONS,
  PLANNED_LOCALES,
  isEnabledLocale,
  isLocale,
  normalizeLocale,
} from './locales';

test('the locale contract plans four languages but initially enables Italian only', () => {
  assert.deepEqual(PLANNED_LOCALES, ['it', 'en', 'es', 'fr']);
  assert.deepEqual(ENABLED_LOCALES, ['it']);
  assert.equal(DEFAULT_LOCALE, 'it');
  assert.equal(isEnabledLocale('it'), true);
  assert.equal(isEnabledLocale('en'), false);
});

test('locale validation distinguishes canonical codes from boundary values', () => {
  assert.equal(isLocale('es'), true);
  assert.equal(isLocale('es-ES'), false);
  assert.equal(isLocale('de'), false);

  assert.equal(normalizeLocale(' ES_es '), 'es');
  assert.equal(normalizeLocale('en-GB'), 'en');
  assert.equal(normalizeLocale('pt-BR'), null);
  assert.equal(normalizeLocale(null), null);
});

test('every planned locale has stable display and formatting metadata', () => {
  assert.deepEqual(Object.keys(LOCALE_DEFINITIONS), PLANNED_LOCALES);
  assert.equal(LOCALE_DEFINITIONS.es.nativeLabel, 'Español');
  assert.equal(getFormatLocale('it'), 'it-IT');
  assert.equal(getFormatLocale('en'), 'en-GB');
  assert.equal(resolveFormatLocale('fr-CA'), 'fr-FR');
  assert.equal(resolveFormatLocale('unsupported'), 'it-IT');
});

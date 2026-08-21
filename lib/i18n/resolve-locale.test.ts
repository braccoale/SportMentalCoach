import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localesFromAcceptLanguage,
  resolveLocale,
} from './resolve-locale';
import type { Locale } from './locales';

const allLocales: readonly Locale[] = ['it', 'en', 'es', 'fr'];

test('Accept-Language honours quality, order and regional variants', () => {
  assert.deepEqual(
    localesFromAcceptLanguage('fr-CA;q=0.7, es-ES;q=0.9, en;q=0.9, de;q=1'),
    ['es', 'en', 'fr']
  );
});

test('Accept-Language removes duplicates and ignores invalid preferences', () => {
  assert.deepEqual(
    localesFromAcceptLanguage('en-US, en;q=0.8, fr;q=0, es;q=oops, *;q=1'),
    ['en']
  );
});

test('locale resolution follows profile, cookie, header and default precedence', () => {
  assert.equal(
    resolveLocale({
      profileLocale: 'fr-FR',
      cookieLocale: 'es',
      acceptLanguage: 'en',
      enabledLocales: allLocales,
    }),
    'fr'
  );
  assert.equal(
    resolveLocale({
      profileLocale: 'de',
      cookieLocale: 'es-ES',
      acceptLanguage: 'fr',
      enabledLocales: allLocales,
    }),
    'es'
  );
  assert.equal(
    resolveLocale({
      profileLocale: null,
      cookieLocale: null,
      acceptLanguage: 'de, en;q=0.8',
      enabledLocales: allLocales,
    }),
    'en'
  );
});

test('planned but disabled locales cannot leak into the current product', () => {
  assert.equal(
    resolveLocale({
      profileLocale: 'fr',
      cookieLocale: 'es',
      acceptLanguage: 'en',
    }),
    'it'
  );
});

test('invalid rollout configuration fails fast', () => {
  assert.throws(
    () => resolveLocale({ enabledLocales: [] }),
    /at least one/i
  );
  assert.throws(
    () =>
      resolveLocale({
        enabledLocales: ['en'],
        defaultLocale: 'it',
      }),
    /default.*enabled/i
  );
});

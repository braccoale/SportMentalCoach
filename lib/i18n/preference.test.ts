import assert from 'node:assert/strict';
import test from 'node:test';
import type { Locale } from './locales';
import {
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  hasSupabaseAuthCookie,
  localeCookieOptions,
  parseEnabledLocalePreference,
} from './preference';

const allLocales: readonly Locale[] = ['it', 'en', 'es', 'fr'];

test('locale preferences accept enabled regional variants only', () => {
  assert.equal(parseEnabledLocalePreference('it-IT'), 'it');
  assert.equal(parseEnabledLocalePreference('en-GB'), null);
  assert.equal(parseEnabledLocalePreference('en-GB', allLocales), 'en');
  assert.equal(parseEnabledLocalePreference('de-DE', allLocales), null);
  assert.equal(parseEnabledLocalePreference(null), null);
});

test('the locale cookie is server-managed, scoped to KaiPai and long-lived', () => {
  assert.equal(LOCALE_COOKIE_NAME, 'kp_locale');
  assert.equal(LOCALE_COOKIE_MAX_AGE, 31_536_000);
  assert.deepEqual(localeCookieOptions(true), {
    httpOnly: true,
    maxAge: 31_536_000,
    path: '/',
    sameSite: 'lax',
    secure: true,
  });
  assert.equal(localeCookieOptions(false).secure, false);
});

test('Supabase auth cookie detection handles normal and chunked cookies', () => {
  assert.equal(
    hasSupabaseAuthCookie([{ name: 'sb-project-auth-token' }]),
    true
  );
  assert.equal(
    hasSupabaseAuthCookie([{ name: 'sb-project-auth-token.0' }]),
    true
  );
  assert.equal(hasSupabaseAuthCookie([{ name: LOCALE_COOKIE_NAME }]), false);
});

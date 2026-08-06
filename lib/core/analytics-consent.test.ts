import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_CONSENT_MAX_AGE_SECONDS,
  analyticsConsentCookie,
  readAnalyticsConsent,
} from './analytics-consent';

test('legge solo una scelta analytics valida', () => {
  assert.equal(readAnalyticsConsent('foo=bar; kp_analytics_consent=granted'), 'granted');
  assert.equal(readAnalyticsConsent('kp_analytics_consent=denied; foo=bar'), 'denied');
  assert.equal(readAnalyticsConsent('kp_analytics_consent=unknown'), null);
  assert.equal(readAnalyticsConsent(''), null);
});

test('la scelta viene ricordata per sei mesi con attributi sicuri', () => {
  const cookie = analyticsConsentCookie('granted', true);

  assert.match(cookie, /kp_analytics_consent=granted/);
  assert.match(cookie, new RegExp(`Max-Age=${ANALYTICS_CONSENT_MAX_AGE_SECONDS}`));
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
});

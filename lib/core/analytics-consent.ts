export const ANALYTICS_CONSENT_COOKIE = 'kp_analytics_consent';
export const ANALYTICS_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export type AnalyticsConsent = 'granted' | 'denied';

export function readAnalyticsConsent(
  cookieHeader: string
): AnalyticsConsent | null {
  const value = cookieHeader
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === ANALYTICS_CONSENT_COOKIE)?.[1];

  return value === 'granted' || value === 'denied' ? value : null;
}

export function analyticsConsentCookie(
  consent: AnalyticsConsent,
  secure: boolean
): string {
  return [
    `${ANALYTICS_CONSENT_COOKIE}=${consent}`,
    'Path=/',
    `Max-Age=${ANALYTICS_CONSENT_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}

import {
  ENABLED_LOCALES,
  normalizeLocale,
  type Locale,
} from './locales';

export const LOCALE_COOKIE_NAME = 'kp_locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Accepts only canonical or regional variants of locales currently enabled
 * for users. Planned-but-disabled languages are deliberately rejected.
 */
export function parseEnabledLocalePreference(
  value: unknown,
  enabledLocales: readonly Locale[] = ENABLED_LOCALES
): Locale | null {
  const locale = normalizeLocale(value);
  return locale && enabledLocales.includes(locale) ? locale : null;
}

/** Cookie names used by Supabase Auth, including chunked auth cookies. */
export function hasSupabaseAuthCookie(
  requestCookies: readonly { name: string }[]
): boolean {
  return requestCookies.some(({ name }) => /^sb-.*-auth-token(?:\.|$)/.test(name));
}

/**
 * The locale cookie is server-managed: it contains only a language code and
 * is never exposed to client JavaScript.
 */
export function localeCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax' as const,
    secure: isProduction,
  };
}

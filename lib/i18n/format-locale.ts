import {
  DEFAULT_LOCALE,
  LOCALE_DEFINITIONS,
  normalizeLocale,
  type Locale,
} from './locales';

export type FormatLocale = (typeof LOCALE_DEFINITIONS)[Locale]['formatLocale'];

/** Returns the BCP 47 locale used by Intl formatters for a KaiPai locale. */
export function getFormatLocale(locale: Locale): FormatLocale {
  return LOCALE_DEFINITIONS[locale].formatLocale;
}

/**
 * Resolves untrusted locale input to a formatter locale with an explicit
 * fallback. This does not check rollout state: disabled languages still need
 * stable formatting metadata for tests, previews and future catalogues.
 */
export function resolveFormatLocale(
  value: unknown,
  fallback: Locale = DEFAULT_LOCALE
): FormatLocale {
  return getFormatLocale(normalizeLocale(value) ?? fallback);
}

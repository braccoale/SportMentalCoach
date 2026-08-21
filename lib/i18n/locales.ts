/**
 * Stable locale identifiers used across KaiPai.
 *
 * Planned locales define the contract that web, mobile, email and AI will
 * share. Enabled locales are deliberately separate: a language must not become
 * publicly selectable before its catalogue and QA are complete.
 */
export const PLANNED_LOCALES = ['it', 'en', 'es', 'fr'] as const;

export type Locale = (typeof PLANNED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'it';

export const ENABLED_LOCALES = ['it'] as const satisfies readonly Locale[];

export type EnabledLocale = (typeof ENABLED_LOCALES)[number];

export type TextDirection = 'ltr' | 'rtl';

export type LocaleDefinition = {
  /** Native label used by language selectors. */
  nativeLabel: string;
  /** BCP 47 locale used by Intl date, number and currency formatters. */
  formatLocale: string;
  direction: TextDirection;
};

export const LOCALE_DEFINITIONS = {
  it: { nativeLabel: 'Italiano', formatLocale: 'it-IT', direction: 'ltr' },
  en: { nativeLabel: 'English', formatLocale: 'en-GB', direction: 'ltr' },
  es: { nativeLabel: 'Español', formatLocale: 'es-ES', direction: 'ltr' },
  fr: { nativeLabel: 'Français', formatLocale: 'fr-FR', direction: 'ltr' },
} as const satisfies Record<Locale, LocaleDefinition>;

const plannedLocaleSet = new Set<string>(PLANNED_LOCALES);

/** True only for canonical KaiPai locale codes such as `it` or `fr`. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && plannedLocaleSet.has(value);
}

/**
 * Converts a supported language tag to its canonical KaiPai locale.
 *
 * Region-bearing values (`en-GB`), underscore variants (`es_ES`) and casing
 * differences are accepted at system boundaries. Unsupported languages are
 * rejected instead of being silently coerced to Italian.
 */
export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null;

  const language = value.trim().toLowerCase().replaceAll('_', '-').split('-')[0];
  return isLocale(language) ? language : null;
}

/** Checks whether a canonical locale is currently safe to expose to users. */
export function isEnabledLocale(
  value: unknown,
  enabledLocales: readonly Locale[] = ENABLED_LOCALES
): value is Locale {
  return isLocale(value) && enabledLocales.includes(value);
}

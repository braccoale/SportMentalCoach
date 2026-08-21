import {
  DEFAULT_LOCALE,
  ENABLED_LOCALES,
  normalizeLocale,
  type Locale,
} from './locales';

export type ResolveLocaleInput = {
  /** Authenticated user's persisted preference. */
  profileLocale?: string | null;
  /** Anonymous or pre-auth browser preference. */
  cookieLocale?: string | null;
  /** Raw HTTP Accept-Language header. */
  acceptLanguage?: string | null;
  /** Override used by rollout configuration and pure tests. */
  enabledLocales?: readonly Locale[];
  defaultLocale?: Locale;
};

type WeightedLanguage = {
  locale: Locale;
  quality: number;
  position: number;
};

/**
 * Parses an Accept-Language header into supported KaiPai locales, ordered by
 * quality and header position. Wildcards, disabled quality values and unknown
 * languages are ignored.
 */
export function localesFromAcceptLanguage(
  header: string | null | undefined
): Locale[] {
  if (!header?.trim()) return [];

  const weighted = header.split(',').flatMap((entry, position) => {
    const [rawTag, ...parameters] = entry.trim().split(';');
    const locale = normalizeLocale(rawTag);
    if (!locale) return [];

    const qualityParameter = parameters
      .map((parameter) => parameter.trim())
      .find((parameter) => parameter.toLowerCase().startsWith('q='));
    const quality = qualityParameter
      ? Number(qualityParameter.slice(2).trim())
      : 1;

    if (!Number.isFinite(quality) || quality <= 0 || quality > 1) return [];
    return [{ locale, quality, position } satisfies WeightedLanguage];
  });

  weighted.sort(
    (left, right) =>
      right.quality - left.quality || left.position - right.position
  );

  const seen = new Set<Locale>();
  return weighted.flatMap(({ locale }) => {
    if (seen.has(locale)) return [];
    seen.add(locale);
    return [locale];
  });
}

/**
 * Resolves the UI locale with one deterministic precedence rule:
 * profile -> cookie -> Accept-Language -> default.
 */
export function resolveLocale(input: ResolveLocaleInput = {}): Locale {
  const enabledLocales = input.enabledLocales ?? ENABLED_LOCALES;
  const defaultLocale = input.defaultLocale ?? DEFAULT_LOCALE;

  if (enabledLocales.length === 0) {
    throw new Error('At least one KaiPai locale must be enabled.');
  }

  const enabled = new Set<Locale>(enabledLocales);
  if (!enabled.has(defaultLocale)) {
    throw new Error('The default KaiPai locale must also be enabled.');
  }

  const directCandidates = [input.profileLocale, input.cookieLocale];
  for (const candidate of directCandidates) {
    const locale = normalizeLocale(candidate);
    if (locale && enabled.has(locale)) return locale;
  }

  for (const locale of localesFromAcceptLanguage(input.acceptLanguage)) {
    if (enabled.has(locale)) return locale;
  }

  return defaultLocale;
}

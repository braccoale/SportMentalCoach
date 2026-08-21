import italianMessages from '@/messages/it.json';
import {
  ENABLED_LOCALES,
  type EnabledLocale,
  type Locale,
} from './locales';

export type MessageCatalog = typeof italianMessages;

/**
 * Explicit import functions keep Next.js output tracing narrow. Adding a
 * locale to ENABLED_LOCALES fails TypeScript until its catalogue is registered
 * here as part of the same change.
 */
export const MESSAGE_CATALOG_LOADERS = {
  it: () => import('@/messages/it.json').then((module) => module.default),
} satisfies Record<EnabledLocale, () => Promise<MessageCatalog>>;

export function hasMessageCatalog(
  locale: Locale
): locale is keyof typeof MESSAGE_CATALOG_LOADERS {
  return locale in MESSAGE_CATALOG_LOADERS;
}

export async function loadMessageCatalog(
  locale: Locale
): Promise<MessageCatalog> {
  if (!hasMessageCatalog(locale)) {
    throw new Error(`No message catalogue configured for locale "${locale}".`);
  }
  return MESSAGE_CATALOG_LOADERS[locale]();
}

/** Runtime invariant mirroring the compile-time loader map check. */
export function configuredCatalogLocales(): readonly string[] {
  return Object.keys(MESSAGE_CATALOG_LOADERS);
}

export function enabledLocaleCodes(): readonly string[] {
  return ENABLED_LOCALES;
}

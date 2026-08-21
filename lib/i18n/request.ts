import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { getUser } from '@/lib/db/queries';
import { getProfileLocale } from '@/lib/core/profiles/locale';
import { loadMessageCatalog } from './catalogs';
import { ENABLED_LOCALES } from './locales';
import { LOCALE_COOKIE_NAME, hasSupabaseAuthCookie } from './preference';
import { resolveLocale } from './resolve-locale';

/**
 * next-intl request configuration without locale routing.
 *
 * Locale routing stays disabled: URLs remain stable. While only one locale is
 * enabled, the fast path also avoids cookie, header, Supabase Auth and profile
 * reads on public traffic. Enabling a second locale automatically activates
 * the persisted profile -> cookie -> Accept-Language resolution chain.
 */
export default getRequestConfig(async () => {
  if (ENABLED_LOCALES.length === 1) {
    const locale = ENABLED_LOCALES[0];
    return { locale, messages: await loadMessageCatalog(locale) };
  }

  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  let profileLocale: string | null = null;

  // Anonymous traffic must not pay for an unnecessary Supabase Auth request.
  if (hasSupabaseAuthCookie(cookieStore.getAll())) {
    const user = await getUser();
    if (user) profileLocale = await getProfileLocale(user.id);
  }

  const locale = resolveLocale({
    profileLocale,
    cookieLocale: cookieStore.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });

  return { locale, messages: await loadMessageCatalog(locale) };
});

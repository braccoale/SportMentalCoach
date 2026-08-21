'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { setProfileLocale } from '@/lib/core/profiles/locale';
import type { ActionState } from '@/lib/auth/middleware';
import {
  LOCALE_COOKIE_NAME,
  localeCookieOptions,
  parseEnabledLocalePreference,
} from '@/lib/i18n/preference';

/**
 * Persists the UI language for both anonymous and authenticated visitors.
 * Signed-in users additionally keep the preference in their own profile, so
 * it follows them across browsers and can later be shared with mobile/email.
 */
export async function saveLocalePreferenceAction(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const locale = parseEnabledLocalePreference(formData.get('locale'));
  if (!locale) return { error: 'Lingua non disponibile.' };

  const user = await getUser();
  if (user) await setProfileLocale(user.id, locale);

  const cookieStore = await cookies();
  cookieStore.set(
    LOCALE_COOKIE_NAME,
    locale,
    localeCookieOptions(process.env.NODE_ENV === 'production')
  );

  revalidatePath('/dashboard/settings');
  return { success: 'Lingua salvata.' };
}

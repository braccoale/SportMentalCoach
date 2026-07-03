'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { setAvatarUrl } from '@/lib/core/profiles';
import type { ActionState } from '@/lib/auth/middleware';

const MAX_AVATAR_URL_LENGTH = 2000;

/** Accepts http(s) URLs, or locally uploaded files under /uploads/. */
function isValidAvatarUrl(value: string): boolean {
  if (value.length > MAX_AVATAR_URL_LENGTH) return false;
  // Locally uploaded files live under /uploads/ (see /api/upload-avatar).
  if (value.startsWith('/uploads/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function updatePhotoAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getUser();
  if (!user) {
    return { error: 'Non autenticato.' };
  }

  const raw = ((formData.get('avatarUrl') as string) ?? '').trim();
  if (raw !== '' && !isValidAvatarUrl(raw)) {
    return {
      error: 'Inserisci un URL immagine http(s) valido.',
      avatarUrl: raw,
    };
  }

  await setAvatarUrl(user.id, raw === '' ? null : raw);

  // Refresh the dashboards and the public listing/profile that show the photo.
  revalidatePath('/dashboard/athlete');
  revalidatePath('/dashboard/coach');
  revalidatePath('/coaches');

  return { success: raw === '' ? 'Foto rimossa.' : 'Foto aggiornata.' };
}

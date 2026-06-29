'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { setAvatarUrl } from '@/lib/core/profiles';
import type { ActionState } from '@/lib/auth/middleware';

export async function updatePhotoAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getUser();
  if (!user) {
    return { error: 'Non autenticato.' };
  }

  const raw = ((formData.get('avatarUrl') as string) ?? '').trim();
  if (raw !== '' && !z.string().url().safeParse(raw).success) {
    return { error: 'Inserisci un URL immagine valido (https://…).', avatarUrl: raw };
  }

  await setAvatarUrl(user.id, raw === '' ? null : raw);

  // Refresh the dashboards and the public listing/profile that show the photo.
  revalidatePath('/dashboard/athlete');
  revalidatePath('/dashboard/coach');
  revalidatePath('/coaches');

  return { success: raw === '' ? 'Foto rimossa.' : 'Foto aggiornata.' };
}

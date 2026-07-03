'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import {
  markAsRead,
  markAllAsRead,
  setEmailPreferences,
  NOTIFICATION_TYPES,
  type EmailPreferences,
} from '@/lib/core/notifications';
import type { ActionState } from '@/lib/auth/middleware';

export async function markNotificationReadAction(formData: FormData) {
  const user = await getUser();
  if (!user) return;
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await markAsRead(user.id, id);
  revalidatePath('/dashboard/notifications');
}

export async function markAllNotificationsReadAction() {
  const user = await getUser();
  if (!user) return;
  await markAllAsRead(user.id);
  revalidatePath('/dashboard/notifications');
}

export async function saveNotificationPreferencesAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getUser();
  if (!user) return { error: 'Non autenticato.' };

  // A checkbox is present in formData only when checked. In-app stays on; this
  // only controls email per type.
  const prefs = NOTIFICATION_TYPES.reduce((acc, type) => {
    acc[type] = formData.has(type);
    return acc;
  }, {} as EmailPreferences);

  await setEmailPreferences(user.id, prefs);
  revalidatePath('/dashboard/notifications/preferences');
  return { success: 'Preferenze salvate.' };
}

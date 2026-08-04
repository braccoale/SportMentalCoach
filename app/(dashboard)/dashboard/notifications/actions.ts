'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import {
  markAsRead,
  markAllAsRead,
  setChannelPreferences,
  isMandatoryEmail,
  NOTIFICATION_TYPES,
  type NotificationType,
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

  // A checkbox is present in formData only when checked — and a disabled one is
  // never submitted, so mandatory events would read as "off". They are excluded
  // here, and `setChannelPreferences` drops them again server-side: a
  // hand-crafted POST cannot switch off a security alert either.
  //
  // The two channels are independent: `in_app:<key>` and `email:<key>` are
  // separate fields, so a user can keep one and drop the other.
  const prefs = NOTIFICATION_TYPES.filter(
    (type) => !isMandatoryEmail(type)
  ).reduce(
    (acc, type) => {
      acc[type] = {
        inApp: formData.has(`in_app:${type}`),
        email: formData.has(`email:${type}`),
      };
      return acc;
    },
    {} as Record<NotificationType, { inApp: boolean; email: boolean }>
  );

  await setChannelPreferences(user.id, prefs);
  revalidatePath('/dashboard/notifications/preferences');
  return { success: 'Preferenze salvate.' };
}

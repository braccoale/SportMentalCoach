'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { markAsRead, markAllAsRead } from '@/lib/core/notifications';

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

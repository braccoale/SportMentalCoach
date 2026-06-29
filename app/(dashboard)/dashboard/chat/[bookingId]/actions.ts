'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { sendMessage } from '@/lib/core/messages';
import type { ActionState } from '@/lib/auth/middleware';

export async function sendMessageAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getUser();
  if (!user) return { error: 'Non autenticato.' };

  const bookingId = Number(formData.get('bookingId'));
  if (!Number.isInteger(bookingId)) return { error: 'Chat non valida.' };

  const body = ((formData.get('body') as string) ?? '').trim();

  const result = await sendMessage(bookingId, user.id, body);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/dashboard/chat/${bookingId}`);
  return { success: 'Inviato.' };
}

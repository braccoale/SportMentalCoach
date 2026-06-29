'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  addAvailabilitySlot,
  deleteAvailabilitySlot,
} from '@/lib/core/availability';
import type { ActionState } from '@/lib/auth/middleware';

/** Parses an `HH:MM` time string to minutes-from-midnight (or null). */
function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export async function addAvailabilityAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');

  const weekday = Number(formData.get('weekday'));
  const startMinute = timeToMinutes((formData.get('start') as string) ?? '');
  const endMinute = timeToMinutes((formData.get('end') as string) ?? '');

  if (!Number.isInteger(weekday) || startMinute === null || endMinute === null) {
    return { error: 'Compila giorno, inizio e fine.' };
  }

  const result = await addAvailabilitySlot(user.id, {
    weekday,
    startMinute,
    endMinute,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/coach');
  return { success: 'Fascia aggiunta.' };
}

export async function deleteAvailabilityAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');

  const slotId = Number(formData.get('slotId'));
  if (!Number.isInteger(slotId)) {
    return { error: 'Fascia non valida.' };
  }

  const result = await deleteAvailabilitySlot(user.id, slotId);
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/coach');
  return { success: 'Fascia rimossa.' };
}

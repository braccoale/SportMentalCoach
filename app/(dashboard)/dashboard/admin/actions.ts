'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { reviewProviderProfile } from '@/lib/core/admin';
import type { ActionState } from '@/lib/auth/middleware';

async function review(
  formData: FormData,
  decision: 'approved' | 'rejected'
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const providerId = Number(formData.get('providerId'));
  if (!Number.isInteger(providerId)) {
    return { error: 'Profilo non valido.' };
  }

  const result = await reviewProviderProfile({
    providerId,
    adminUserId: admin.id,
    decision,
  });
  if (!result.ok) {
    return { error: result.error };
  }

  // Refresh the queue and the public listing (approval changes visibility).
  revalidatePath('/dashboard/admin');
  revalidatePath('/coaches');
  return {
    success: decision === 'approved' ? 'Profilo approvato.' : 'Profilo rifiutato.',
  };
}

export async function approveProviderAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  return review(formData, 'approved');
}

export async function rejectProviderAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  return review(formData, 'rejected');
}

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { reviewProviderProfile } from '@/lib/core/admin';

async function review(formData: FormData, decision: 'approved' | 'rejected') {
  const admin = await requireRole('admin');
  const providerId = Number(formData.get('providerId'));
  if (!Number.isFinite(providerId)) return;
  await reviewProviderProfile({ providerId, adminUserId: admin.id, decision });
  // Refresh the queue and the public listing (approval changes visibility).
  revalidatePath('/dashboard/admin');
  revalidatePath('/coaches');
}

export async function approveProviderAction(formData: FormData) {
  await review(formData, 'approved');
}

export async function rejectProviderAction(formData: FormData) {
  await review(formData, 'rejected');
}

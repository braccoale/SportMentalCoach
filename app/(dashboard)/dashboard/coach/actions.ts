'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { decideBooking } from '@/lib/core/bookings';

async function decide(formData: FormData, decision: 'accepted' | 'declined') {
  const user = await requireRole('coach');
  const bookingId = Number(formData.get('bookingId'));
  if (!Number.isFinite(bookingId)) return;
  await decideBooking({ bookingId, coachUserId: user.id, decision });
  revalidatePath('/dashboard/coach');
}

export async function acceptBookingAction(formData: FormData) {
  await decide(formData, 'accepted');
}

export async function declineBookingAction(formData: FormData) {
  await decide(formData, 'declined');
}

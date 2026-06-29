'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { hasRole } from '@/lib/core/auth';
import { createBookingRequest } from '@/lib/core/bookings';
import type { ActionState } from '@/lib/auth/middleware';

const requestSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.string().optional(),
  note: z.string().max(1000).optional(),
});

export async function requestBooking(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getUser();
  if (!user) {
    const slug = formData.get('slug') as string | null;
    redirect(`/sign-in?redirect=/coaches/${slug ?? ''}`);
  }

  const isAthlete = await hasRole(user.id, 'athlete');
  if (!isAthlete) {
    return { error: 'Solo gli atleti possono richiedere una sessione.' };
  }

  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const { slug, serviceId, note } = parsed.data;
  const sid = serviceId && serviceId !== '' ? Number(serviceId) : null;

  const result = await createBookingRequest({
    clientUserId: user.id,
    providerSlug: slug,
    serviceId: sid,
    note: note?.trim() || null,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  redirect('/dashboard/athlete?requested=1');
}

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  createCoachService,
  updateCoachService,
  deleteCoachService,
  type ServiceInput,
} from '@/lib/core/services';

function parseServiceInput(formData: FormData): ServiceInput {
  const title = ((formData.get('title') as string) ?? '').trim();
  const description = ((formData.get('description') as string) ?? '').trim();
  const durRaw = (formData.get('durationMin') as string) ?? '';
  const priceRaw = (formData.get('price') as string) ?? '';
  return {
    title,
    description: description || null,
    durationMin: durRaw ? Math.round(Number(durRaw)) : null,
    // price entered in euros; stored as cents
    price: priceRaw ? Math.round(Number(priceRaw) * 100) : null,
  };
}

function revalidate() {
  revalidatePath('/dashboard/coach');
  revalidatePath('/coaches');
}

export async function createServiceAction(formData: FormData) {
  const user = await requireRole('coach');
  await createCoachService(user.id, parseServiceInput(formData));
  revalidate();
}

export async function updateServiceAction(formData: FormData) {
  const user = await requireRole('coach');
  const serviceId = Number(formData.get('serviceId'));
  if (Number.isFinite(serviceId)) {
    await updateCoachService(user.id, serviceId, parseServiceInput(formData));
  }
  revalidate();
}

export async function deleteServiceAction(formData: FormData) {
  const user = await requireRole('coach');
  const serviceId = Number(formData.get('serviceId'));
  if (Number.isFinite(serviceId)) {
    await deleteCoachService(user.id, serviceId);
  }
  revalidate();
}

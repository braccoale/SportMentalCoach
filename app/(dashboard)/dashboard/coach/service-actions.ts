'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  createCoachService,
  updateCoachService,
  deleteCoachService,
  type ServiceInput,
} from '@/lib/core/services';
import type { ActionState } from '@/lib/auth/middleware';

const serviceSchema = z.object({
  title: z.string().trim().min(1, 'Il titolo è obbligatorio.').max(160),
  description: z.string().trim().max(4000).optional(),
  // duration in whole minutes
  durationMin: z.coerce
    .number()
    .int('La durata deve essere un numero intero di minuti.')
    .min(0)
    .max(100000)
    .optional(),
  // price entered in euros (decimals allowed), stored as cents
  price: z.coerce
    .number()
    .min(0, 'Il prezzo non può essere negativo.')
    .max(1000000)
    .optional(),
});

type ParseResult =
  | { ok: true; value: ServiceInput }
  | { ok: false; error: string };

function parseServiceInput(formData: FormData): ParseResult {
  const get = (k: string) => ((formData.get(k) as string) ?? '').trim();
  const durationRaw = get('durationMin');
  const priceRaw = get('price');

  const parsed = serviceSchema.safeParse({
    title: get('title'),
    description: get('description') || undefined,
    durationMin: durationRaw === '' ? undefined : durationRaw,
    price: priceRaw === '' ? undefined : priceRaw,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0].message };
  }

  const d = parsed.data;
  return {
    ok: true,
    value: {
      title: d.title,
      description: d.description ?? null,
      durationMin: d.durationMin ?? null,
      price: d.price != null ? Math.round(d.price * 100) : null,
    },
  };
}

function parseServiceId(formData: FormData): number | null {
  const id = Number(formData.get('serviceId'));
  return Number.isInteger(id) ? id : null;
}

function revalidate() {
  revalidatePath('/dashboard/coach');
  revalidatePath('/coaches');
}

export async function createServiceAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');
  const parsed = parseServiceInput(formData);
  if (!parsed.ok) return { error: parsed.error };

  const result = await createCoachService(user.id, parsed.value);
  if (!result.ok) return { error: result.error };

  revalidate();
  return { success: 'Servizio aggiunto.' };
}

export async function updateServiceAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');
  const serviceId = parseServiceId(formData);
  if (serviceId === null) return { error: 'Servizio non valido.' };

  const parsed = parseServiceInput(formData);
  if (!parsed.ok) return { error: parsed.error };

  const result = await updateCoachService(user.id, serviceId, parsed.value);
  if (!result.ok) return { error: result.error };

  revalidate();
  return { success: 'Servizio aggiornato.' };
}

export async function deleteServiceAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');
  const serviceId = parseServiceId(formData);
  if (serviceId === null) return { error: 'Servizio non valido.' };

  const result = await deleteCoachService(user.id, serviceId);
  if (!result.ok) return { error: result.error };

  revalidate();
  return { success: 'Servizio eliminato.' };
}

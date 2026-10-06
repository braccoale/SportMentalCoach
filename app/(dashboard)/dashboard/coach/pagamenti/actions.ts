'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/core/auth';
import {
  coachCanEditPlans,
  createCoachSessionPlan,
  getCoachPaymentsState,
  setCoachPlanRecommended,
  setCoachSessionPlanStatus,
  setCoachSingleSessionPrice,
  syncCoachStripeStatus,
} from '@/lib/core/billing';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * I piani di sedute del coach. Ogni azione ricontrolla che i pagamenti siano
 * attivi per questo coach: nascondere la voce di menu non è un cancello.
 */

export async function createSessionPlanAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');
  if (!coachCanEditPlans(await getCoachPaymentsState(user.id))) {
    return { error: 'I pagamenti non sono attivi per il tuo profilo.' };
  }

  const result = await createCoachSessionPlan({
    coachUserId: user.id,
    input: {
      name: String(formData.get('name') ?? ''),
      description: String(formData.get('description') ?? ''),
      recommended: formData.get('recommended') === 'on',
      sessionsPerMonth: String(formData.get('sessionsPerMonth') ?? ''),
      monthlyPrice: String(formData.get('monthlyPrice') ?? ''),
    },
  });

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors };
  }

  revalidatePath('/dashboard/coach/pagamenti');
  return { success: 'Piano creato. È in bozza: attivalo quando vuoi renderlo disponibile.' };
}

async function changeStatus(
  formData: FormData,
  status: 'active' | 'archived' | 'draft'
) {
  const user = await requireRole('coach');
  if (!coachCanEditPlans(await getCoachPaymentsState(user.id))) return;
  const planId = Number(formData.get('planId'));
  if (!Number.isInteger(planId)) return;

  const result = await setCoachSessionPlanStatus({
    coachUserId: user.id,
    planId,
    status,
  });
  revalidatePath('/dashboard/coach/pagamenti');
  // Un interruttore che non fa niente senza dirlo è peggio di uno rotto: il
  // codice è fisso, il testo lo sceglie la pagina (mai quello del chiamante).
  if (!result.ok) redirect('/dashboard/coach/pagamenti?errore=stato-piano');
}

export async function activateSessionPlanAction(formData: FormData) {
  await changeStatus(formData, 'active');
}

export async function archiveSessionPlanAction(formData: FormData) {
  await changeStatus(formData, 'archived');
}

export async function restoreSessionPlanAction(formData: FormData) {
  await changeStatus(formData, 'draft');
}

/**
 * Rilegge da Stripe lo stato del coach, quando esce dalla verifica incorporata.
 * Non solleva: se Stripe non risponde, la pagina mostra l'ultimo stato noto.
 */
export async function refreshPaymentsStatusAction(): Promise<void> {
  const user = await requireRole('coach');
  if (!coachCanEditPlans(await getCoachPaymentsState(user.id))) return;
  try {
    await syncCoachStripeStatus(user.id);
  } catch (error) {
    console.error('[payments] stato non sincronizzato', {
      coachUserId: user.id,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
  }
  revalidatePath('/dashboard/coach/pagamenti');
}

export async function toggleRecommendedPlanAction(formData: FormData) {
  const user = await requireRole('coach');
  if (!coachCanEditPlans(await getCoachPaymentsState(user.id))) return;
  const planId = Number(formData.get('planId'));
  if (!Number.isInteger(planId)) return;
  await setCoachPlanRecommended({
    coachUserId: user.id,
    planId,
    recommended: formData.get('value') === '1',
  });
  revalidatePath('/dashboard/coach/pagamenti');
}

/** Imposta o toglie il prezzo della seduta singola (campo vuoto = non la vendo). */
export async function saveSingleSessionPriceAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');
  if (!coachCanEditPlans(await getCoachPaymentsState(user.id))) {
    return { error: 'I pagamenti non sono attivi per il tuo profilo.' };
  }
  const result = await setCoachSingleSessionPrice({
    coachUserId: user.id,
    input: String(formData.get('singleSessionPrice') ?? ''),
  });
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/coach/pagamenti');
  return {
    success:
      result.priceCents === null
        ? 'Seduta singola disattivata: gli atleti non la vedono più.'
        : 'Prezzo della seduta singola salvato.',
  };
}

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  reviewProviderProfile,
  setProviderVerification,
  type VerificationField,
} from '@/lib/core/admin';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Le decisioni sui profili coach.
 *
 * Ogni esito finisce nel registro amministrativo, **anche quando fallisce**:
 * fino a ieri l'approvazione scriveva `reviewed_by` sul profilo — cioè
 * l'ultimo che ha deciso, non la storia — e la revoca di una verifica non
 * scriveva niente. A distanza di sei mesi non c'era modo di sapere chi avesse
 * tolto una spunta, né quando.
 */

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

  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: decision === 'approved' ? 'coach_approved' : 'coach_rejected',
    subjectType: 'provider_profile',
    subjectId: providerId,
    outcome: result.ok ? 'ok' : 'fallita',
    detail: { decisione: decision },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  // Refresh the queue and the public listing (approval changes visibility).
  revalidatePath('/dashboard/admin');
  revalidatePath('/dashboard/admin/coach');
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

async function setVerification(formData: FormData, field: VerificationField) {
  const admin = await requireRole('admin');
  const providerId = Number(formData.get('providerId'));
  const value = formData.get('value') === '1';
  if (!Number.isInteger(providerId)) return;

  const result = await setProviderVerification({
    providerId,
    field,
    value,
    actorUserId: admin.id,
  });

  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'coach_verification_changed',
    subjectType: 'provider_profile',
    subjectId: providerId,
    outcome: result.ok ? 'ok' : 'fallita',
    detail: { campo: field, valore: value },
  });

  revalidatePath('/dashboard/admin');
  revalidatePath('/dashboard/admin/coach');
  revalidatePath('/coaches');
}

export async function toggleIdentityVerifiedAction(formData: FormData) {
  await setVerification(formData, 'identity');
}

export async function toggleCertificationsVerifiedAction(formData: FormData) {
  await setVerification(formData, 'certifications');
}

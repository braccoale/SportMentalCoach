'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/lib/auth/middleware';
import { revokeGuardianAuthorization } from '@/lib/core/guardians';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';

export async function revokeGuardianAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = String(formData.get('token') ?? '');
  if (!token) return { error: 'Collegamento non valido.' };

  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    null;
  let liveKit = null;
  try {
    liveKit = createProductionAiSessionNotesDependencies().liveKit;
  } catch {
    // Revocation must never depend on an optional provider being configured.
    // DB gates and processing cancellation still apply synchronously.
  }

  const result = await revokeGuardianAuthorization(
    {
      token,
      signatureName: String(formData.get('signatureName') ?? ''),
      reason: String(formData.get('reason') ?? ''),
      ip,
      userAgent: h.get('user-agent'),
    },
    liveKit
  );
  if (!result.ok) return { error: result.error };

  revalidatePath('/dashboard/athlete');
  revalidatePath('/dashboard/athlete/calendar');
  revalidatePath('/dashboard/coach');
  revalidatePath('/dashboard/coach/calendar');
  revalidatePath('/tutore/gestisci');
  return {
    success: result.alreadyRevoked
      ? 'L’autorizzazione era già stata revocata.'
      : `Autorizzazione revocata. Il percorso di ${result.athleteName} è stato bloccato.`,
  };
}

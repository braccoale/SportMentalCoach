'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/core/auth';
import { recordCoachAgreementAcceptance } from '@/lib/core/legal/acceptance';
import { signatureMatchesName } from '@/lib/core/legal/signature';
import type { ActionState } from '@/lib/auth/middleware';

export async function signCoachAgreementAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');

  const signature = ((formData.get('signature') as string) ?? '').trim();
  const acceptedTerms = formData.get('acceptTerms') === 'on';
  const acceptedVexatious = formData.get('acceptVexatious') === 'on';

  if (!signatureMatchesName(signature, user.name, user.lastName)) {
    return {
      error:
        'La firma deve corrispondere al nome e cognome del tuo account. Se non sono corretti, aggiornali dal profilo.',
    };
  }

  // Prova di chi ha firmato e da dove. Dietro proxy il client reale è il
  // primo elemento di x-forwarded-for.
  const h = await headers();
  const ipAddress =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;

  const result = await recordCoachAgreementAcceptance({
    userId: user.id,
    signatureName: signature,
    acceptedTerms,
    acceptedVexatious,
    ipAddress,
    userAgent: h.get('user-agent'),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  redirect('/dashboard/coach');
}

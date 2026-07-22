'use server';

import { headers } from 'next/headers';
import { confirmGuardian } from '@/lib/core/guardians';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Records a guardian's authorisation. Deliberately unauthenticated: the
 * guardian has no account, and the signed token in the link is the credential.
 */
export async function confirmGuardianAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = String(formData.get('token') ?? '');
  if (!token) return { error: 'Link non valido.' };

  // The declaration required by art. 316 c.c. — acting with the agreement of
  // the other parent, where there is one.
  const bothParents = formData.get('bothParents') === 'on';

  // Behind Vercel the client address arrives in `x-forwarded-for`; the first
  // entry is the original client.
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    null;

  const result = await confirmGuardian({ token, bothParents, ip });
  if (!result.ok) return { error: result.error };

  return {
    success: `Autorizzazione registrata. ${result.athleteName} può ora avviare il percorso.`,
  };
}

'use server';

import { headers } from 'next/headers';
import { confirmGuardian } from '@/lib/core/guardians';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Records a guardian's authorisation. Deliberately unauthenticated: the
 * guardian has no account; the one-time opaque token delivered by email is the
 * credential and only its SHA-256 digest exists in the database.
 */
export async function confirmGuardianAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const token = String(formData.get('token') ?? '');
  if (!token) return { error: 'Link non valido.' };

  // Behind Vercel the client address arrives in `x-forwarded-for`; the first
  // entry is the original client.
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    null;

  const result = await confirmGuardian({
    token,
    signatureName: String(formData.get('signatureName') ?? ''),
    authorityBasis: String(formData.get('authorityBasis') ?? ''),
    adultDeclared: formData.get('adultDeclared') === 'on',
    parentalResponsibilityDeclared:
      formData.get('parentalResponsibilityDeclared') === 'on',
    acceptedTerms: formData.get('acceptedTerms') === 'on',
    acceptedVexatious: formData.get('acceptedVexatious') === 'on',
    aiRecordingAuthorized: formData.get('aiRecordingAuthorized') === 'on',
    ip,
    userAgent: h.get('user-agent'),
  });
  if (!result.ok) return { error: result.error };

  return {
    success: `Autorizzazione registrata. ${result.athleteName} può ora avviare il percorso.`,
  };
}

'use server';

import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { requireRole } from '@/lib/core/auth';
import { syncDisplayName } from '@/lib/core/profiles';
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

  // The account may still be missing name/lastName (signup never asks for
  // them). When the form carries them along, the signature must be validated
  // against the just-submitted values — not the stale (empty) account name —
  // but nothing may be written until that check passes. Persisting first
  // would let a mistyped name "stick" on a failed attempt: the page then
  // sees hasFullName === true, stops rendering the name fields, and the
  // coach is locked comparing the signature against the typo forever.
  const hasFullName = !!(user.name?.trim() && user.lastName?.trim());
  let effectiveName = user.name;
  let effectiveLastName = user.lastName;
  let name = '';
  let lastName = '';
  if (!hasFullName) {
    name = ((formData.get('name') as string) ?? '').trim();
    lastName = ((formData.get('lastName') as string) ?? '').trim();
    if (!name || !lastName) {
      return { error: 'Inserisci nome e cognome.' };
    }
    if (name.length > 100 || lastName.length > 100) {
      return { error: 'Nome e cognome non devono superare 100 caratteri.' };
    }

    effectiveName = name;
    effectiveLastName = lastName;
  }

  if (!signatureMatchesName(signature, effectiveName, effectiveLastName)) {
    return {
      error: hasFullName
        ? 'La firma deve corrispondere al nome e cognome del tuo account. Se non sono corretti, aggiornali dal profilo.'
        : 'La firma deve corrispondere al nome e cognome appena inseriti.',
    };
  }

  if (!hasFullName) {
    await Promise.all([
      db
        .update(users)
        .set({ name, lastName, updatedBy: user.id })
        .where(eq(users.id, user.id)),
      syncDisplayName(user.id, [name, lastName].filter(Boolean).join(' ')),
    ]);
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

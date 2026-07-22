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
  // them). When the form carried them along, persist first — the signature
  // check right below must run against the name just submitted, not against
  // the stale (empty) account name, or an unnamed coach could never sign.
  let effectiveName = user.name;
  let effectiveLastName = user.lastName;
  const hasFullName = !!(user.name?.trim() && user.lastName?.trim());
  if (!hasFullName) {
    const name = ((formData.get('name') as string) ?? '').trim();
    const lastName = ((formData.get('lastName') as string) ?? '').trim();
    if (!name || !lastName) {
      return { error: 'Inserisci nome e cognome.' };
    }

    await Promise.all([
      db
        .update(users)
        .set({ name, lastName, updatedBy: user.id })
        .where(eq(users.id, user.id)),
      syncDisplayName(user.id, [name, lastName].filter(Boolean).join(' ')),
    ]);

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

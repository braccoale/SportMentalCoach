'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  FEATURE_CODES,
  revokeFeatureEntitlement,
  setFeatureEntitlement,
} from '@/lib/core/features';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import type { ActionState } from '@/lib/auth/middleware';

export async function updateAiNotesEntitlementAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const targetUserId = Number(formData.get('userId'));
  const operation = String(formData.get('operation') ?? '');
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return { error: 'Utente non valido.' };
  }

  try {
    if (operation === 'revoke') {
      const dependencies = createProductionAiSessionNotesDependencies();
      await revokeFeatureEntitlement({
        actorUserId: admin.id,
        targetUserId,
        featureCode: FEATURE_CODES.AI_SESSION_NOTES,
      }, dependencies.liveKit);
    } else if (operation === 'trial') {
      const expiresAt = new Date();
      expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
      await setFeatureEntitlement({
        actorUserId: admin.id,
        targetUserId,
        featureCode: FEATURE_CODES.AI_SESSION_NOTES,
        status: 'trial',
        source: 'trial',
        startsAt: new Date(),
        expiresAt,
      });
    } else if (operation === 'enable') {
      await setFeatureEntitlement({
        actorUserId: admin.id,
        targetUserId,
        featureCode: FEATURE_CODES.AI_SESSION_NOTES,
        status: 'enabled',
        source: 'admin',
      });
    } else {
      return { error: 'Operazione non valida.' };
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'USER_NOT_FOUND') {
      return { error: 'Utente non trovato.' };
    }
    return { error: 'Impossibile aggiornare l’abilitazione.' };
  }

  revalidatePath('/dashboard/admin/ai-notes');
  return {
    success:
      operation === 'revoke'
        ? 'Funzionalità revocata.'
        : 'Funzionalità abilitata.',
  };
}

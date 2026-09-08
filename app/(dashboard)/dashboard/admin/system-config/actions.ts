'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { setSystemConfigValue } from '@/lib/core/system-config';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';
import type { SystemConfigValueType } from '@/lib/db/schema';

export async function updateSystemConfigAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const key = String(formData.get('key') ?? '').trim();
  const valueType = String(formData.get('valueType') ?? '') as SystemConfigValueType;
  const rawValue =
    valueType === 'boolean'
      ? String(formData.get('rawValue') ?? '')
      : String(formData.get('rawValue') ?? '').trim();

  if (!key || !['number', 'string', 'boolean'].includes(valueType)) {
    return { error: 'Richiesta non valida.' };
  }

  const result = await setSystemConfigValue({
    actorUserId: admin.id,
    key,
    valueType,
    rawValue,
  });

  if (!result.ok) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'configuration_changed',
      subjectType: 'configuration',
      outcome: 'fallita',
      detail: { chiave: key },
    });
    return { error: result.error };
  }

  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'configuration_changed',
    subjectType: 'configuration',
    outcome: 'ok',
    detail: { chiave: key },
  });

  revalidatePath('/dashboard/admin/system-config');
  return { success: `${key} aggiornata.` };
}

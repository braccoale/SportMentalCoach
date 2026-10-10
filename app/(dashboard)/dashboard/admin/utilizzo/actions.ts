'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import { clientIpFromHeaders } from '@/lib/core/usage/catalog';
import { addExcludedIp, removeExcludedIp } from '@/lib/core/usage/server';

/**
 * Esclude dal tracciamento l'indirizzo da cui l'amministratore sta guardando la
 * pagina in questo momento. Si legge dalla richiesta e non da un campo da
 * compilare: così non serve conoscere il proprio IP né copiarlo, e non si può
 * escludere per sbaglio quello di qualcun altro.
 */
export async function excludeMyIpAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin');
  const h = await headers();
  const ip = clientIpFromHeaders((name) => h.get(name));
  if (!ip) return;
  const label = String(formData.get('label') ?? '').trim() || 'Amministratore';
  const ok = await addExcludedIp(ip, label, admin.id);
  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'configuration_changed',
    subjectType: 'configuration',
    subjectId: null,
    outcome: ok ? 'ok' : 'fallita',
    detail: { chiave: 'usage_excluded_ips', operazione: 'aggiunto' },
  });
  revalidatePath('/dashboard/admin/utilizzo');
}

export async function removeExcludedIpAction(formData: FormData): Promise<void> {
  const admin = await requireRole('admin');
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id)) return;
  await removeExcludedIp(id);
  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'configuration_changed',
    subjectType: 'configuration',
    subjectId: id,
    outcome: 'ok',
    detail: { chiave: 'usage_excluded_ips', operazione: 'rimosso' },
  });
  revalidatePath('/dashboard/admin/utilizzo');
}

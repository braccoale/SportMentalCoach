'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import { clientIpFromHeaders } from '@/lib/core/usage/catalog';
import { addExcludedIp, removeExcludedIp } from '@/lib/core/usage/server';
import { parseWidgetSpec } from '@/lib/core/usage/catalog';
import { getUsersForWidget, type WidgetList } from '@/lib/core/usage/queries-users';

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

/**
 * L'elenco di chi c'è dietro un numero o un grafico della pagina «Utilizzo».
 * Solo per l'amministratore, e solo per le richieste previste (`parseWidgetSpec`):
 * quello che arriva dal browser è testo e non finisce mai in una query.
 */
export async function listUsersForWidgetAction(
  spec: string,
  days: number
): Promise<{ ok: true; list: WidgetList } | { ok: false; error: string }> {
  await requireRole('admin');
  const parsed = parseWidgetSpec(spec);
  if (!parsed) return { ok: false, error: 'Richiesta non valida.' };
  const period = [7, 30, 90].includes(days) ? days : 30;
  try {
    return { ok: true, list: await getUsersForWidget(parsed, period) };
  } catch (error) {
    console.error('[usage] elenco non letto', error instanceof Error ? error.message : error);
    return { ok: false, error: 'Non riesco a leggere l’elenco. Riprova.' };
  }
}

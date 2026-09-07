'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  assignPackageToOrganization,
  createPackage,
  revokeOrganizationPackage,
} from '@/lib/core/features/packages';
import {
  getFeatureMatrix,
  setFeatureMatrix,
  type FeatureMatrix,
} from '@/lib/core/features/catalog';
import { parseFeatureMatrixSubmission } from '@/lib/core/features/matrix-form';
import {
  addOrganizationMember,
  findUserByEmail,
} from '@/lib/core/organizations';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import { romeDayStartShifted, romeDayValueToInstant } from '@/lib/core/admin/period';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Un messaggio leggibile per l'admin, mai il testo grezzo di Postgres.
 * `FORBIDDEN` viene da `assertAdmin` (difesa in profondità: la route ha
 * già passato `requireRole('admin')`, ma la funzione di lib/core non si
 * fida).
 */
function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.message === 'FORBIDDEN') return 'Non autorizzato.';
    if (error.message.includes('packages_key_unique')) {
      return 'Chiave già in uso da un altro pacchetto.';
    }
    if (error.message.includes('organization_packages_window_check')) {
      return "La scadenza deve essere successiva all'inizio.";
    }
  }
  return fallback;
}

export async function createPackageAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const key = String(formData.get('key') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  if (!key || !name) {
    return { error: 'Chiave e nome sono obbligatori.' };
  }

  try {
    const created = await createPackage({ actorUserId: admin.id, key, name });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_created',
      subjectType: 'package',
      subjectId: created.id,
      outcome: 'ok',
      detail: { chiave: key },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_created',
      subjectType: 'package',
      outcome: 'fallita',
      detail: { chiave: key },
    });
    return { error: friendlyError(error, 'Impossibile creare il pacchetto.') };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto creato.' };
}

export async function updateFeatureMatrixAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');

  let matrix: FeatureMatrix;
  try {
    matrix = await getFeatureMatrix(admin.id);
  } catch (error) {
    return { error: friendlyError(error, 'Impossibile leggere la matrice.') };
  }

  const parsed = parseFeatureMatrixSubmission({
    packages: matrix.packages,
    features: matrix.features,
    getField: (name) => {
      const value = formData.get(name);
      return value === null ? null : String(value);
    },
  });
  if ('error' in parsed) {
    return { error: parsed.error };
  }

  try {
    await setFeatureMatrix({ actorUserId: admin.id, entries: parsed.entries });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_features_updated',
      subjectType: 'package',
      outcome: 'ok',
      detail: { celle: parsed.entries.length },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_features_updated',
      subjectType: 'package',
      outcome: 'fallita',
      detail: {},
    });
    return { error: friendlyError(error, 'Impossibile salvare la matrice.') };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Matrice salvata.' };
}

export async function assignPackageToOrganizationAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const organizationId = Number(formData.get('organizationId'));
  const packageId = Number(formData.get('packageId'));
  if (
    !Number.isInteger(organizationId) ||
    organizationId <= 0 ||
    !Number.isInteger(packageId) ||
    packageId <= 0
  ) {
    return { error: 'Organizzazione o pacchetto non validi.' };
  }

  const expiresAtRaw = String(formData.get('expiresAt') ?? '').trim();
  let expiresAt: Date | null = null;
  if (expiresAtRaw) {
    const chosenDay = romeDayValueToInstant(expiresAtRaw);
    if (!chosenDay) {
      return { error: 'Data di scadenza non valida.' };
    }
    // La scadenza copre l'intera giornata scelta, a Roma: l'istante
    // memorizzato è l'inizio del giorno *dopo*.
    expiresAt = romeDayStartShifted(chosenDay, 1);
  }

  const startsAt = new Date();
  if (expiresAt && expiresAt <= startsAt) {
    return { error: 'La data di scadenza deve essere nel futuro.' };
  }

  try {
    await assignPackageToOrganization({
      actorUserId: admin.id,
      organizationId,
      packageId,
      startsAt,
      expiresAt,
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'organization_package_assigned',
      subjectType: 'organization',
      subjectId: organizationId,
      outcome: 'ok',
      detail: { pacchetto: packageId },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'organization_package_assigned',
      subjectType: 'organization',
      subjectId: organizationId,
      outcome: 'fallita',
      detail: { pacchetto: packageId },
    });
    return { error: friendlyError(error, 'Impossibile assegnare il pacchetto.') };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto assegnato.' };
}

export async function revokeOrganizationPackageAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const organizationId = Number(formData.get('organizationId'));
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    return { error: 'Organizzazione non valida.' };
  }

  let updated: boolean;
  try {
    updated = await revokeOrganizationPackage({
      actorUserId: admin.id,
      organizationId,
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'organization_package_revoked',
      subjectType: 'organization',
      subjectId: organizationId,
      outcome: 'fallita',
      detail: {},
    });
    return { error: friendlyError(error, 'Impossibile revocare il pacchetto.') };
  }

  await recordAdminAudit({
    actor: { id: admin.id, email: admin.email },
    action: 'organization_package_revoked',
    subjectType: 'organization',
    subjectId: organizationId,
    outcome: updated ? 'ok' : 'fallita',
    detail: {},
  });

  if (!updated) {
    return { error: 'Nessun pacchetto attivo da revocare per questa organizzazione.' };
  }
  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto revocato.' };
}

export async function addOrganizationMemberAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const organizationId = Number(formData.get('organizationId'));
  const email = String(formData.get('email') ?? '').trim();
  if (!Number.isInteger(organizationId) || organizationId <= 0 || !email) {
    return { error: 'Organizzazione o email non validi.' };
  }

  const user = await findUserByEmail(admin.id, email);
  if (!user) {
    return { error: `Nessun utente con email ${email}.` };
  }

  try {
    await addOrganizationMember({
      actorUserId: admin.id,
      organizationId,
      userId: user.id,
    });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'organization_member_added',
      subjectType: 'organization',
      subjectId: organizationId,
      outcome: 'ok',
      detail: { utente: user.id },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'organization_member_added',
      subjectType: 'organization',
      subjectId: organizationId,
      outcome: 'fallita',
      detail: { utente: user.id },
    });
    return {
      error: friendlyError(error, "Impossibile aggiungere il membro all'organizzazione."),
    };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: `${email} aggiunto all'organizzazione.` };
}

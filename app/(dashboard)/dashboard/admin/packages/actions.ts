'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/core/auth';
import {
  assignPackageToOrganization,
  createPackage,
  revokeOrganizationPackage,
  setPackageFeatures,
} from '@/lib/core/features/packages';
import { FEATURE_CODES, type FeatureCode } from '@/lib/core/features';
import {
  addOrganizationMember,
  findUserByEmail,
} from '@/lib/core/organizations';
import { recordAdminAudit } from '@/lib/core/admin/audit-log';
import type { ActionState } from '@/lib/auth/middleware';

const KNOWN_FEATURE_CODES = Object.values(FEATURE_CODES) as FeatureCode[];

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
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Impossibile creare il pacchetto.',
    };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Pacchetto creato.' };
}

export async function updatePackageFeaturesAction(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const admin = await requireRole('admin');
  const packageId = Number(formData.get('packageId'));
  if (!Number.isInteger(packageId) || packageId <= 0) {
    return { error: 'Pacchetto non valido.' };
  }
  const featureCodes = KNOWN_FEATURE_CODES.filter(
    (code) => formData.get(`feature_${code}`) === 'on'
  );

  try {
    await setPackageFeatures({ actorUserId: admin.id, packageId, featureCodes });
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_features_updated',
      subjectType: 'package',
      subjectId: packageId,
      outcome: 'ok',
      detail: { conteggio: featureCodes.length },
    });
  } catch (error) {
    await recordAdminAudit({
      actor: { id: admin.id, email: admin.email },
      action: 'package_features_updated',
      subjectType: 'package',
      subjectId: packageId,
      outcome: 'fallita',
      detail: {},
    });
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Impossibile aggiornare le feature.',
    };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: 'Feature aggiornate.' };
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
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

  try {
    await assignPackageToOrganization({
      actorUserId: admin.id,
      organizationId,
      packageId,
      startsAt: new Date(),
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
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Impossibile assegnare il pacchetto.',
    };
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

  const updated = await revokeOrganizationPackage({
    actorUserId: admin.id,
    organizationId,
  });
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
      error:
        error instanceof Error
          ? error.message
          : "Impossibile aggiungere il membro all'organizzazione.",
    };
  }

  revalidatePath('/dashboard/admin/packages');
  return { success: `${email} aggiunto all'organizzazione.` };
}

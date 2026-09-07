import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  organizationPackages,
  packages,
  type OrganizationPackageStatus,
  type Package,
  type PackageStatus,
} from '@/lib/db/schema';
import { assertAdmin } from './index';

export type PackageSummary = {
  id: number;
  key: string;
  name: string;
  status: PackageStatus;
};

/** L'elenco dei pacchetti — per il selettore di assegnazione a un'organizzazione. */
export async function listPackages(
  actorUserId: number
): Promise<PackageSummary[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      id: packages.id,
      key: packages.key,
      name: packages.name,
      status: packages.status,
    })
    .from(packages)
    .orderBy(packages.id);
  return rows.map((row) => ({ ...row, status: row.status as PackageStatus }));
}

export async function createPackage(params: {
  actorUserId: number;
  key: string;
  name: string;
}): Promise<Package> {
  await assertAdmin(params.actorUserId);
  const [created] = await db
    .insert(packages)
    .values({
      key: params.key,
      name: params.name,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .returning();
  return created;
}

/**
 * Assegna un pacchetto a un'organizzazione. Chiude la riga corrente
 * (`active`/`suspended`) prima di aprirne una nuova, così l'indice unico
 * parziale su `status = 'active'` non viene mai violato e la storia dei
 * pacchetti precedenti resta leggibile.
 */
export async function assignPackageToOrganization(params: {
  actorUserId: number;
  organizationId: number;
  packageId: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.transaction(async (tx) => {
    await tx
      .update(organizationPackages)
      .set({
        status: 'expired',
        updatedDate: new Date(),
        updatedBy: params.actorUserId,
      })
      .where(
        and(
          eq(organizationPackages.organizationId, params.organizationId),
          inArray(organizationPackages.status, ['active', 'suspended'])
        )
      );
    await tx.insert(organizationPackages).values({
      organizationId: params.organizationId,
      packageId: params.packageId,
      status: 'active',
      startsAt: params.startsAt ?? null,
      expiresAt: params.expiresAt ?? null,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    });
  });
}

/**
 * Revoca il pacchetto corrente di un'organizzazione (`active` o `suspended`
 * → `expired`). `false` se l'organizzazione non aveva un pacchetto corrente
 * da revocare.
 */
export async function revokeOrganizationPackage(params: {
  actorUserId: number;
  organizationId: number;
}): Promise<boolean> {
  await assertAdmin(params.actorUserId);
  const [updated] = await db
    .update(organizationPackages)
    .set({
      status: 'expired',
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(
      and(
        eq(organizationPackages.organizationId, params.organizationId),
        inArray(organizationPackages.status, ['active', 'suspended'])
      )
    )
    .returning({ id: organizationPackages.id });
  return Boolean(updated);
}


export type CurrentOrganizationPackage = {
  packageId: number;
  packageName: string;
  status: OrganizationPackageStatus;
  expiresAt: Date | null;
};

/**
 * Il pacchetto corrente (attivo o sospeso) di un'organizzazione, se c'è.
 * Sostituisce, nella pagina, la vista che prima viveva nelle schede
 * per-pacchetto — qui vive accanto a dove si assegna e si revoca.
 */
export async function getCurrentOrganizationPackage(
  actorUserId: number,
  organizationId: number
): Promise<CurrentOrganizationPackage | null> {
  await assertAdmin(actorUserId);
  const [row] = await db
    .select({
      packageId: organizationPackages.packageId,
      packageName: packages.name,
      status: organizationPackages.status,
      expiresAt: organizationPackages.expiresAt,
    })
    .from(organizationPackages)
    .innerJoin(packages, eq(packages.id, organizationPackages.packageId))
    .where(
      and(
        eq(organizationPackages.organizationId, organizationId),
        inArray(organizationPackages.status, ['active', 'suspended'])
      )
    )
    .limit(1);
  if (!row) return null;
  return { ...row, status: row.status as OrganizationPackageStatus };
}

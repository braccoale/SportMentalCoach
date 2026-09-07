import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  organizationPackages,
  organizations,
  packageFeatures,
  packages,
  type OrganizationPackageStatus,
  type Package,
  type PackageStatus,
} from '@/lib/db/schema';
import { assertAdmin } from './index';
import type { FeatureCode } from './policy';

export type PackageWithFeatures = {
  id: number;
  key: string;
  name: string;
  status: PackageStatus;
  featureCodes: FeatureCode[];
};

/** Tutti i pacchetti, con le feature che ciascuno include. */
export async function listPackages(
  actorUserId: number
): Promise<PackageWithFeatures[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      id: packages.id,
      key: packages.key,
      name: packages.name,
      status: packages.status,
      featureCode: packageFeatures.featureCode,
    })
    .from(packages)
    .leftJoin(packageFeatures, eq(packageFeatures.packageId, packages.id))
    .orderBy(packages.id);

  const byId = new Map<number, PackageWithFeatures>();
  for (const row of rows) {
    let entry = byId.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        key: row.key,
        name: row.name,
        status: row.status as PackageStatus,
        featureCodes: [],
      };
      byId.set(row.id, entry);
    }
    if (row.featureCode) entry.featureCodes.push(row.featureCode as FeatureCode);
  }
  return [...byId.values()];
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

/** Sostituisce l'intero insieme di feature di un pacchetto. */
export async function setPackageFeatures(params: {
  actorUserId: number;
  packageId: number;
  featureCodes: FeatureCode[];
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.transaction(async (tx) => {
    await tx
      .delete(packageFeatures)
      .where(eq(packageFeatures.packageId, params.packageId));
    if (params.featureCodes.length > 0) {
      await tx.insert(packageFeatures).values(
        params.featureCodes.map((featureCode) => ({
          packageId: params.packageId,
          featureCode,
          createdBy: params.actorUserId,
        }))
      );
    }
  });
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

export type OrganizationPackageRow = {
  organizationId: number;
  organizationName: string;
  status: OrganizationPackageStatus;
  startsAt: Date | null;
  expiresAt: Date | null;
};

/** Le organizzazioni che hanno (o hanno avuto) questo pacchetto. */
export async function listOrganizationsForPackage(
  actorUserId: number,
  packageId: number
): Promise<OrganizationPackageRow[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      organizationId: organizationPackages.organizationId,
      organizationName: organizations.name,
      status: organizationPackages.status,
      startsAt: organizationPackages.startsAt,
      expiresAt: organizationPackages.expiresAt,
    })
    .from(organizationPackages)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationPackages.organizationId)
    )
    .where(eq(organizationPackages.packageId, packageId))
    .orderBy(desc(organizationPackages.updatedDate));
  return rows.map((row) => ({
    ...row,
    status: row.status as OrganizationPackageStatus,
  }));
}

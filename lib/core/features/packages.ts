import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  packages,
  userPackages,
  users,
  type Package,
  type PackageStatus,
  type UserPackageStatus,
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
 * Assegna un pacchetto a un utente. Chiude la riga corrente
 * (`active`/`suspended`) prima di aprirne una nuova, così l'indice unico
 * parziale su `status = 'active'` non viene mai violato e la storia dei
 * pacchetti precedenti resta leggibile.
 */
export async function assignPackageToUser(params: {
  actorUserId: number;
  userId: number;
  packageId: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  await db.transaction(async (tx) => {
    await tx
      .update(userPackages)
      .set({
        status: 'expired',
        updatedDate: new Date(),
        updatedBy: params.actorUserId,
      })
      .where(
        and(
          eq(userPackages.userId, params.userId),
          inArray(userPackages.status, ['active', 'suspended'])
        )
      );
    await tx.insert(userPackages).values({
      userId: params.userId,
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
 * Revoca il pacchetto corrente di un utente (`active` o `suspended` →
 * `expired`). `false` se l'utente non aveva un pacchetto corrente da
 * revocare.
 */
export async function revokeUserPackage(params: {
  actorUserId: number;
  userId: number;
}): Promise<boolean> {
  await assertAdmin(params.actorUserId);
  const [updated] = await db
    .update(userPackages)
    .set({
      status: 'expired',
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(
      and(
        eq(userPackages.userId, params.userId),
        inArray(userPackages.status, ['active', 'suspended'])
      )
    )
    .returning({ id: userPackages.id });
  return Boolean(updated);
}


export type CurrentUserPackage = {
  packageId: number;
  packageName: string;
  status: UserPackageStatus;
  expiresAt: Date | null;
};

/** Il pacchetto corrente (attivo o sospeso) di un utente, se c'è. */
export async function getCurrentUserPackage(
  actorUserId: number,
  userId: number
): Promise<CurrentUserPackage | null> {
  await assertAdmin(actorUserId);
  const [row] = await db
    .select({
      packageId: userPackages.packageId,
      packageName: packages.name,
      status: userPackages.status,
      expiresAt: userPackages.expiresAt,
    })
    .from(userPackages)
    .innerJoin(packages, eq(packages.id, userPackages.packageId))
    .where(
      and(
        eq(userPackages.userId, userId),
        inArray(userPackages.status, ['active', 'suspended'])
      )
    )
    .limit(1);
  if (!row) return null;
  return { ...row, status: row.status as UserPackageStatus };
}

export type UserPackageRow = {
  userId: number;
  email: string;
  displayName: string;
  status: UserPackageStatus;
  expiresAt: Date | null;
};

/** Gli utenti che hanno (attivo o sospeso) questo pacchetto oggi. */
export async function listUsersForPackage(
  actorUserId: number,
  packageId: number
): Promise<UserPackageRow[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
      status: userPackages.status,
      expiresAt: userPackages.expiresAt,
    })
    .from(userPackages)
    .innerJoin(users, eq(users.id, userPackages.userId))
    .where(
      and(
        eq(userPackages.packageId, packageId),
        inArray(userPackages.status, ['active', 'suspended'])
      )
    )
    .orderBy(asc(users.email));
  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    displayName: [row.name, row.lastName].filter(Boolean).join(' ') || row.email,
    status: row.status as UserPackageStatus,
    expiresAt: row.expiresAt,
  }));
}

/**
 * `null` se nessun utente ha questa email — l'azione chiamante decide il
 * messaggio. Spostata qui da `lib/core/organizations/` (rimosso): serve a
 * cercare l'utente a cui assegnare un pacchetto, non ha più senso in un
 * modulo dedicato alle organizzazioni.
 */
export async function findUserByEmail(
  actorUserId: number,
  email: string
): Promise<{ id: number; email: string } | null> {
  await assertAdmin(actorUserId);
  const [found] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.email, email.trim().toLowerCase()),
        isNull(users.deletedAt),
        eq(users.isDemo, false)
      )
    )
    .limit(1);
  return found ?? null;
}

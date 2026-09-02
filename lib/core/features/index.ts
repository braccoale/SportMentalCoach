import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  profiles,
  sessionAiAuditEvents,
  userFeatureEntitlements,
  userRoles,
  users,
  type FeatureEntitlementSource,
  type FeatureEntitlementStatus,
} from '@/lib/db/schema';
import {
  evaluateFeatureEntitlement,
  type FeatureAccessResult,
  type FeatureCode,
} from './policy';
import { stopAiNotesRecordingsForRequester } from '@/lib/core/ai-session-notes/recording';
import type { LiveKitSessionControl } from '@/lib/core/ai-session-notes/livekit-session-control';

export {
  FEATURE_CODES,
  evaluateFeatureEntitlement,
  type FeatureAccessReason,
  type FeatureAccessResult,
  type FeatureCode,
  type FeatureEntitlementSnapshot,
} from './policy';

export async function getFeatureAccess(
  userId: number,
  featureCode: FeatureCode,
  now = new Date()
): Promise<FeatureAccessResult> {
  const [entitlement] = await db
    .select({
      id: userFeatureEntitlements.id,
      status: userFeatureEntitlements.status,
      source: userFeatureEntitlements.source,
      startsAt: userFeatureEntitlements.startsAt,
      expiresAt: userFeatureEntitlements.expiresAt,
      usageLimit: userFeatureEntitlements.usageLimit,
      usageCount: userFeatureEntitlements.usageCount,
    })
    .from(userFeatureEntitlements)
    .where(
      and(
        eq(userFeatureEntitlements.userId, userId),
        eq(userFeatureEntitlements.featureCode, featureCode)
      )
    )
    .limit(1);

  return evaluateFeatureEntitlement(
    entitlement
      ? {
          ...entitlement,
          status: entitlement.status as FeatureEntitlementStatus,
          source: entitlement.source as FeatureEntitlementSource,
        }
      : null,
    now
  );
}

export async function hasFeatureEntitlement(
  userId: number,
  featureCode: FeatureCode
): Promise<boolean> {
  return (await getFeatureAccess(userId, featureCode)).allowed;
}

async function assertAdmin(actorUserId: number): Promise<void> {
  const [admin] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, actorUserId),
        eq(userRoles.roleKey, 'admin')
      )
    )
    .limit(1);
  if (!admin) throw new Error('FORBIDDEN');
}

export type FeatureAdminUser = {
  userId: number;
  displayName: string;
  email: string;
  roles: string[];
  status: FeatureEntitlementStatus | null;
  source: FeatureEntitlementSource | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
};

/** Admin projection used by the minimal entitlement management page. */
export async function getFeatureAdminUsers(
  actorUserId: number,
  featureCode: FeatureCode
): Promise<FeatureAdminUser[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
      profileName: profiles.displayName,
      role: userRoles.roleKey,
      status: userFeatureEntitlements.status,
      source: userFeatureEntitlements.source,
      startsAt: userFeatureEntitlements.startsAt,
      expiresAt: userFeatureEntitlements.expiresAt,
      usageLimit: userFeatureEntitlements.usageLimit,
      usageCount: userFeatureEntitlements.usageCount,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(
      userFeatureEntitlements,
      and(
        eq(userFeatureEntitlements.userId, users.id),
        eq(userFeatureEntitlements.featureCode, featureCode)
      )
    )
    // I conti demo non compaiono nell'amministrazione: abilitare gli Appunti
    // AI su un account sintetico non vuol dire niente, e in elenco tolgono
    // spazio alle persone vere. Stessa regola di `lib/core/admin`.
    .where(and(isNull(users.deletedAt), eq(users.isDemo, false)))
    .orderBy(asc(users.email));

  const byUser = new Map<number, FeatureAdminUser>();
  for (const row of rows) {
    let user = byUser.get(row.userId);
    if (!user) {
      const accountName = [row.name, row.lastName].filter(Boolean).join(' ');
      user = {
        userId: row.userId,
        displayName:
          row.profileName?.trim() || accountName.trim() || row.email,
        email: row.email,
        roles: [],
        status: row.status as FeatureEntitlementStatus | null,
        source: row.source as FeatureEntitlementSource | null,
        startsAt: row.startsAt,
        expiresAt: row.expiresAt,
        usageLimit: row.usageLimit,
        usageCount: row.usageCount ?? 0,
      };
      byUser.set(row.userId, user);
    }
    if (row.role && !user.roles.includes(row.role)) user.roles.push(row.role);
  }
  return [...byUser.values()];
}

export async function setFeatureEntitlement(params: {
  actorUserId: number;
  targetUserId: number;
  featureCode: FeatureCode;
  status: Extract<FeatureEntitlementStatus, 'enabled' | 'trial'>;
  source: FeatureEntitlementSource;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  usageLimit?: number | null;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  if (
    params.usageLimit !== undefined &&
    params.usageLimit !== null &&
    (!Number.isInteger(params.usageLimit) || params.usageLimit < 0)
  ) {
    throw new Error('INVALID_USAGE_LIMIT');
  }
  if (
    params.startsAt &&
    params.expiresAt &&
    params.expiresAt <= params.startsAt
  ) {
    throw new Error('INVALID_WINDOW');
  }

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, params.targetUserId), isNull(users.deletedAt)))
    .limit(1);
  if (!target) throw new Error('USER_NOT_FOUND');

  await db.transaction(async (tx) => {
    await tx
      .insert(userFeatureEntitlements)
      .values({
        userId: params.targetUserId,
        featureCode: params.featureCode,
        status: params.status,
        source: params.source,
        startsAt: params.startsAt ?? null,
        expiresAt: params.expiresAt ?? null,
        usageLimit: params.usageLimit ?? null,
        usageCount: 0,
        metadata: {},
        createdBy: params.actorUserId,
        updatedBy: params.actorUserId,
      })
      .onConflictDoUpdate({
        target: [
          userFeatureEntitlements.userId,
          userFeatureEntitlements.featureCode,
        ],
        set: {
          status: params.status,
          source: params.source,
          startsAt: params.startsAt ?? null,
          expiresAt: params.expiresAt ?? null,
          usageLimit: params.usageLimit ?? null,
          usageCount: 0,
          updatedDate: sql`now()`,
          updatedBy: params.actorUserId,
        },
      });
    await tx.insert(sessionAiAuditEvents).values({
      sessionAiNotesId: null,
      eventType:
        params.status === 'trial'
          ? 'entitlement_trial_started'
          : 'entitlement_granted',
      actorUserId: params.actorUserId,
      eventMetadata: {
        targetUserId: params.targetUserId,
        featureCode: params.featureCode,
        source: params.source,
      },
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    });
  });
}

export async function revokeFeatureEntitlement(params: {
  actorUserId: number;
  targetUserId: number;
  featureCode: FeatureCode;
}, liveKit: LiveKitSessionControl): Promise<void> {
  await assertAdmin(params.actorUserId);
  const revoked = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(userFeatureEntitlements)
      .set({
        status: 'disabled',
        updatedDate: new Date(),
        updatedBy: params.actorUserId,
      })
      .where(
        and(
          eq(userFeatureEntitlements.userId, params.targetUserId),
          eq(userFeatureEntitlements.featureCode, params.featureCode)
        )
      )
      .returning({ id: userFeatureEntitlements.id });
    if (!updated) return false;
    await tx.insert(sessionAiAuditEvents).values({
      sessionAiNotesId: null,
      eventType: 'entitlement_revoked',
      actorUserId: params.actorUserId,
      eventMetadata: {
        targetUserId: params.targetUserId,
        featureCode: params.featureCode,
      },
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    });
    return true;
  });
  if (revoked && params.featureCode === 'AI_SESSION_NOTES') {
    await stopAiNotesRecordingsForRequester({
      requestedBy: params.targetUserId,
      actorUserId: params.actorUserId,
      reason: 'entitlement_revoked',
    }, liveKit);
  }
}

import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db/drizzle';
import {
  providerProfiles,
  profiles,
  clientProfiles,
  userRoles,
  users,
  type ProviderStatus,
} from '@/lib/db/schema';
import { notify } from '@/lib/core/notifications';
import { resolveDisplayName } from '@/lib/core/format';
import type { Result } from '@/lib/core/result';

export type ProviderReviewItem = {
  id: number;
  slug: string | null;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  headline: string | null;
  categories: string[] | null;
  specialties: string[] | null;
  status: string;
  identityVerified: boolean;
  certificationsVerified: boolean;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

export type VerificationField = 'identity' | 'certifications';

/**
 * All provider profiles for admin review, across every status
 * (draft / pending / approved / rejected), newest first.
 */
export async function getProviderProfilesForReview(): Promise<
  ProviderReviewItem[]
> {
  const reviewer = alias(users, 'reviewer');

  return db
    .select({
      id: providerProfiles.id,
      slug: providerProfiles.slug,
      displayName: profiles.displayName,
      email: users.email,
      avatarUrl: profiles.avatarUrl,
      headline: providerProfiles.headline,
      categories: providerProfiles.categories,
      specialties: providerProfiles.specialties,
      status: providerProfiles.status,
      identityVerified: providerProfiles.identityVerified,
      certificationsVerified: providerProfiles.certificationsVerified,
      reviewedByName: sql<string | null>`coalesce(
        nullif(trim(concat(
          coalesce(${reviewer.name}, ''),
          ' ',
          coalesce(${reviewer.lastName}, '')
        )), ''),
        ${reviewer.email}
      )`,
      reviewedAt: providerProfiles.reviewedAt,
      createdAt: providerProfiles.createdAt,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(providerProfiles.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .leftJoin(reviewer, eq(reviewer.id, providerProfiles.reviewedBy))
    .orderBy(desc(providerProfiles.createdAt));
}

export type AthleteAdminItem = {
  userId: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  category: string | null;
  level: string | null;
  city: string | null;
  birthDate: string | null;
  goals: string | null;
  createdAt: Date;
};

/** Every registered athlete, for the admin overview. Newest first. */
export async function getAllAthletesForAdmin(): Promise<AthleteAdminItem[]> {
  const rows = await db
    .select({
      userId: users.id,
      rawName: sql<string | null>`nullif(trim(concat(coalesce(${users.name}, ''), ' ', coalesce(${users.lastName}, ''))), '')`,
      email: users.email,
      avatarUrl: profiles.avatarUrl,
      category: clientProfiles.category,
      level: clientProfiles.level,
      city: clientProfiles.city,
      birthDate: clientProfiles.birthDate,
      goals: clientProfiles.goals,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), eq(userRoles.roleKey, 'athlete'))
    )
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt));

  return rows.map((r) => ({
    userId: r.userId,
    name: resolveDisplayName(r.rawName, r.email),
    email: r.email,
    avatarUrl: r.avatarUrl,
    category: r.category,
    level: r.level,
    city: r.city,
    birthDate: r.birthDate,
    goals: r.goals,
    createdAt: r.createdAt,
  }));
}

/** Admin toggles a verification flag on a provider profile. */
export async function setProviderVerification(params: {
  providerId: number;
  field: VerificationField;
  value: boolean;
  actorUserId?: number;
}): Promise<Result> {
  const patch =
    params.field === 'identity'
      ? { identityVerified: params.value }
      : { certificationsVerified: params.value };

  const [updated] = await db
    .update(providerProfiles)
    .set({ ...patch, updatedAt: new Date(), updatedBy: params.actorUserId ?? null })
    .where(eq(providerProfiles.id, params.providerId))
    .returning({ id: providerProfiles.id });

  if (!updated) return { ok: false, error: 'Profilo non trovato.' };
  return { ok: true };
}

/**
 * Admin decision on a provider profile. Records the reviewer and timestamp.
 * Only `approved` / `rejected` are valid admin outcomes.
 */
export async function reviewProviderProfile(params: {
  providerId: number;
  adminUserId: number;
  decision: Extract<ProviderStatus, 'approved' | 'rejected'>;
}): Promise<Result> {
  if (params.decision !== 'approved' && params.decision !== 'rejected') {
    return { ok: false, error: 'Decisione non valida.' };
  }

  const [updated] = await db
    .update(providerProfiles)
    .set({
      status: params.decision,
      reviewedBy: params.adminUserId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: params.adminUserId,
    })
    .where(eq(providerProfiles.id, params.providerId))
    .returning({ id: providerProfiles.id, userId: providerProfiles.userId });

  if (!updated) {
    return { ok: false, error: 'Profilo non trovato.' };
  }

  await notify(
    params.decision === 'approved' ? 'provider_approved' : 'provider_rejected',
    updated.userId
  );

  return { ok: true };
}

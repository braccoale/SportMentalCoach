import 'server-only';
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db/drizzle';
import {
  providerProfiles,
  profiles,
  clientProfiles,
  bookings,
  services,
  userRoles,
  users,
  type ProviderStatus,
} from '@/lib/db/schema';
import { notify } from '@/lib/core/notifications';
import {
  computeCoachOnboarding,
  type CoachOnboarding,
} from '@/lib/core/onboarding';
import { resolveDisplayName } from '@/lib/core/format';
import type { Result } from '@/lib/core/result';
import { MAX_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';

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
  registeredAt: Date;
  submittedAt: Date | null;
  onboarding: CoachOnboarding;
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

  const rows = await db
    .select({
      id: providerProfiles.id,
      slug: providerProfiles.slug,
      displayName: profiles.displayName,
      email: users.email,
      avatarUrl: profiles.avatarUrl,
      headline: providerProfiles.headline,
      description: providerProfiles.description,
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
      registeredAt: users.createdAt,
      submittedAt: providerProfiles.submittedAt,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(providerProfiles.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .leftJoin(reviewer, eq(reviewer.id, providerProfiles.reviewedBy))
    .orderBy(desc(users.createdAt));

  const providerIds = rows.map((row) => row.id);
  const serviceCounts =
    providerIds.length === 0
      ? []
      : await db
          .select({
            providerId: services.providerId,
            value: count(),
          })
          .from(services)
          .where(
            and(
              inArray(services.providerId, providerIds),
              eq(services.isActive, true),
              gt(services.durationMin, 0),
              lte(services.durationMin, MAX_SERVICE_DURATION_MIN)
            )
          )
          .groupBy(services.providerId);
  const serviceCountByProvider = new Map(
    serviceCounts.map((row) => [row.providerId, row.value])
  );

  return rows.map(({ description, ...row }) => ({
    ...row,
    onboarding: computeCoachOnboarding(
      {
        headline: row.headline,
        description,
        categories: row.categories,
        specialties: row.specialties,
        status: row.status,
      },
      serviceCountByProvider.get(row.id) ?? 0
    ),
  }));
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
  completedSessions: number;
  scheduledSessions: number;
  totalMinutes: number;
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

  const userIds = rows.map((row) => row.userId);
  const statsRows =
    userIds.length === 0
      ? []
      : await db
          .select({
            userId: bookings.clientId,
            completedSessions: sql<number>`count(*) filter (
              where ${bookings.status} = 'completed'
            )::int`,
            scheduledSessions: sql<number>`count(*) filter (
              where ${bookings.status} in ('requested', 'accepted')
                and ${bookings.scheduledFor} >= now()
            )::int`,
            totalMinutes: sql<number>`coalesce(sum(
              greatest(
                case
                  when ${bookings.sessionStartedAt} is not null and ${bookings.sessionEndedAt} is not null
                    then extract(epoch from (${bookings.sessionEndedAt} - ${bookings.sessionStartedAt})) / 60
                  else coalesce(${services.durationMin}, 0)
                end,
                0
              )
            ) filter (where ${bookings.status} = 'completed'), 0)::int`,
          })
          .from(bookings)
          .leftJoin(services, eq(services.id, bookings.serviceId))
          .where(inArray(bookings.clientId, userIds))
          .groupBy(bookings.clientId);
  const statsByUser = new Map(
    statsRows.map((row) => [
      row.userId,
      {
        completedSessions: row.completedSessions,
        scheduledSessions: row.scheduledSessions,
        totalMinutes: row.totalMinutes,
      },
    ])
  );

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
    completedSessions: statsByUser.get(r.userId)?.completedSessions ?? 0,
    scheduledSessions: statsByUser.get(r.userId)?.scheduledSessions ?? 0,
    totalMinutes: statsByUser.get(r.userId)?.totalMinutes ?? 0,
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

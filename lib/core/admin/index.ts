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
import { effectiveBookingDurationMin } from '@/lib/core/bookings/conflict-query';
import { ageFromBirthDate, requiresGuardian } from '@/lib/core/guardians';
import { buildCoachRosters, type CoachRoster } from './coach-roster';
import { buildTodaySessions, type AdminTodaySession } from './today-sessions';
import type { AdminBookingRow } from './booking-rows';
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
  /** Conto di dimostrazione: in elenco va distinto da una persona vera. */
  isDemo: boolean;
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
      isDemo: users.isDemo,
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
  /** Conto di dimostrazione: in elenco va distinto da una persona vera. */
  isDemo: boolean;
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
      isDemo: users.isDemo,
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
    isDemo: r.isDemo,
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

/**
 * Le prenotazioni che servono all'amministrazione, lette una volta sola.
 *
 * Una query per tutti i coach, non una per coach. La differenza non è di
 * stile: `getCoachBookings` porta con sé una sottoquery per prenotazione per
 * gli stati degli appunti AI, e ripeterla per ogni riga dell'elenco
 * amministrazione significherebbe decine di scansioni per aprire una pagina.
 * Qui quei campi non servono — l'amministrazione guarda persone e agenda, non
 * riepiloghi da validare — e restano fuori.
 *
 * Le prenotazioni degli utenti cancellati non entrano: un account eliminato
 * non è un atleta seguito.
 */
async function getAdminBookingRows(): Promise<AdminBookingRow[]> {
  const coachUser = alias(users, 'coach_user');
  const coachProfile = alias(profiles, 'coach_profile');

  const rows = await db
    .select({
      providerId: bookings.providerId,
      id: bookings.id,
      clientId: bookings.clientId,
      status: bookings.status,
      scheduledFor: bookings.scheduledFor,
      requestedAt: bookings.requestedAt,
      sessionStartedAt: bookings.sessionStartedAt,
      sessionEndedAt: bookings.sessionEndedAt,
      clientName: sql<string | null>`nullif(trim(concat(coalesce(${users.name}, ''), ' ', coalesce(${users.lastName}, ''))), '')`,
      clientEmail: users.email,
      clientAvatarUrl: profiles.avatarUrl,
      athleteSport: clientProfiles.category,
      athleteLevel: clientProfiles.level,
      athleteGoals: clientProfiles.goals,
      athleteBirthDate: clientProfiles.birthDate,
      serviceTitle: services.title,
      durationMin: effectiveBookingDurationMin,
      coachDisplayName: coachProfile.displayName,
      coachRawName: sql<string | null>`nullif(trim(concat(coalesce(${coachUser.name}, ''), ' ', coalesce(${coachUser.lastName}, ''))), '')`,
      coachEmail: coachUser.email,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .leftJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .innerJoin(coachUser, eq(coachUser.id, providerProfiles.userId))
    .leftJoin(coachProfile, eq(coachProfile.userId, providerProfiles.userId))
    .where(isNull(users.deletedAt))
    .orderBy(desc(bookings.requestedAt));

  // La data di nascita non esce da qui: all'amministrazione serve sapere che
  // è un minore, non quando compie gli anni. Stessa regola della dashboard
  // coach.
  return rows.map(
    ({
      athleteBirthDate,
      coachDisplayName,
      coachRawName,
      coachEmail,
      ...row
    }) => {
      const age = ageFromBirthDate(athleteBirthDate);
      return {
        ...row,
        athleteIsMinor: requiresGuardian(age),
        athleteAge: age,
        coachName: resolveDisplayName(coachDisplayName ?? coachRawName, coachEmail),
      };
    }
  );
}

/**
 * Le due letture che la pagina amministrazione fa sulle stesse prenotazioni:
 * chi segue ogni coach, e cosa succede oggi.
 *
 * Stanno insieme perché vengono dalla stessa query: chiederle separatamente
 * vorrebbe dire leggere due volte tutte le prenotazioni per disegnare una
 * pagina sola.
 */
export async function getAdminBookingsOverview(now: Date = new Date()): Promise<{
  rosters: Map<number, CoachRoster>;
  todaySessions: AdminTodaySession[];
}> {
  const rows = await getAdminBookingRows();
  return {
    rosters: buildCoachRosters(rows, now),
    todaySessions: buildTodaySessions(rows, now),
  };
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

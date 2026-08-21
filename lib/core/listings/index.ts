import { getAllSpecialties } from '@/lib/core/taxonomies';
import 'server-only';
import {
  and,
  arrayContains,
  eq,
  gt,
  isNotNull,
  lte,
  type SQL,
} from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { providerProfiles, profiles, services, users } from '@/lib/db/schema';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';
import { getRatingSummaries } from '@/lib/core/reviews';
import { getCoachExperienceStats } from '@/lib/core/bookings';
import { MAX_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';

export type CoachListItem = {
  slug: string;
  displayName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  categories: string[] | null;
  specialties: string[] | null;
  hourlyRate: number | null;
  currency: string;
  certified: boolean;
};

export type CoachFilters = {
  sport?: string;
  specialty?: string;
};

/**
 * Public listing query. Returns only `approved` providers that have a slug,
 * joined with their common profile. Optional filters narrow by sport
 * (`categories`) and specialty (`specialties`) using array containment.
 */
export async function getApprovedCoaches(
  filters: CoachFilters = {}
): Promise<CoachListItem[]> {
  const conditions = [
    eq(providerProfiles.status, 'approved'),
    isNotNull(providerProfiles.slug),
    eq(users.isDemo, false),
  ];

  if (filters.sport) {
    conditions.push(arrayContains(providerProfiles.categories, [filters.sport]));
  }
  if (filters.specialty) {
    conditions.push(
      arrayContains(providerProfiles.specialties, [filters.specialty])
    );
  }

  const rows = await db
    .select({
      slug: providerProfiles.slug,
      displayName: profiles.displayName,
      headline: providerProfiles.headline,
      avatarUrl: profiles.avatarUrl,
      categories: providerProfiles.categories,
      specialties: providerProfiles.specialties,
      hourlyRate: providerProfiles.hourlyRate,
      currency: providerProfiles.currency,
      certified: providerProfiles.isKaipaiCertified,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(and(...conditions))
    .orderBy(providerProfiles.id);

  // slug is guaranteed non-null by the isNotNull filter above.
  return rows as CoachListItem[];
}

export type CoachDetail = CoachListItem & {
  providerId: number;
  bio: string | null;
  description: string | null;
  videoUrl: string | null;
  yearsExperience: number | null;
  languages: string[] | null;
  certifications: string[] | null;
  athleteLevels: string[] | null;
  identityVerified: boolean;
  certificationsVerified: boolean;
  memberSince: Date;
  /** Distinct athletes coached and total coaching minutes, from completed sessions. */
  athletesCount: number;
  totalMinutes: number;
  services: {
    id: number;
    title: string | null;
    description: string | null;
    durationMin: number | null;
    price: number | null;
    currency: string;
  }[];
};

/**
 * Public detail query for a single approved coach by slug, with their common
 * profile and active services. Returns `null` when not found or not approved.
 */
export async function getCoachBySlug(slug: string): Promise<CoachDetail | null> {
  const [coach] = await db
    .select({
      providerId: providerProfiles.id,
      slug: providerProfiles.slug,
      displayName: profiles.displayName,
      headline: providerProfiles.headline,
      avatarUrl: profiles.avatarUrl,
      bio: profiles.bio,
      description: providerProfiles.description,
      categories: providerProfiles.categories,
      specialties: providerProfiles.specialties,
      hourlyRate: providerProfiles.hourlyRate,
      currency: providerProfiles.currency,
      certified: providerProfiles.isKaipaiCertified,
      videoUrl: providerProfiles.videoUrl,
      yearsExperience: providerProfiles.yearsExperience,
      languages: providerProfiles.languages,
      certifications: providerProfiles.certifications,
      athleteLevels: providerProfiles.athleteLevels,
      identityVerified: providerProfiles.identityVerified,
      certificationsVerified: providerProfiles.certificationsVerified,
      memberSince: providerProfiles.createdAt,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(
      and(
        eq(providerProfiles.slug, slug),
        eq(providerProfiles.status, 'approved'),
        eq(users.isDemo, false)
      )
    )
    .limit(1);

  if (!coach) return null;

  const stats = (await getCoachExperienceStats([coach.providerId])).get(
    coach.providerId
  ) ?? { athletesCount: 0, totalMinutes: 0 };

  const svc = await db
    .select({
      id: services.id,
      title: services.title,
      description: services.description,
      durationMin: services.durationMin,
      price: services.price,
      currency: services.currency,
    })
    .from(services)
    .where(
      and(
        eq(services.providerId, coach.providerId),
        eq(services.isActive, true),
        gt(services.durationMin, 0),
        lte(services.durationMin, MAX_SERVICE_DURATION_MIN)
      )
    )
    .orderBy(services.id);

  // slug is the queried value, guaranteed non-null.
  return { ...coach, slug, services: svc, ...stats };
}

// --- Discovery (matching) ---------------------------------------------------

export type DiscoverySort =
  | 'activity'
  | 'recommended'
  | 'rating'
  | 'price'
  | 'experience';

export type DiscoveryFilters = {
  sport?: string;
  specialty?: string;
  level?: string;
  language?: string;
  certifiedOnly?: boolean;
  sort?: DiscoverySort;
};

export type DiscoveryCoach = {
  providerId: number;
  slug: string;
  displayName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  categories: string[] | null;
  specialties: string[] | null;
  hourlyRate: number | null;
  currency: string;
  certified: boolean;
  yearsExperience: number | null;
  languages: string[] | null;
  athleteLevels: string[] | null;
  hasVideo: boolean;
  rating: { average: number | null; count: number };
  matchReasons: string[];
  recommended: boolean;
  isFavorite: boolean;
  /** Distinct athletes coached and total coaching minutes, from completed sessions. */
  athletesCount: number;
  totalMinutes: number;
};

/**
 * The recommendation-style listing. Filters narrow to relevant approved
 * coaches; a transparent quality score ranks them; per-card match reasons
 * explain *why*. No AI — a deterministic heuristic.
 */
export async function getCoachDiscovery(
  filters: DiscoveryFilters = {},
  opts: { favoriteIds?: Set<number> } = {}
): Promise<DiscoveryCoach[]> {
  // Specialty labels for match reasons come from the DB master data.
  const specialtyItems = filters.specialty ? await getAllSpecialties() : [];
  const conditions: SQL[] = [
    eq(providerProfiles.status, 'approved'),
    isNotNull(providerProfiles.slug),
    eq(users.isDemo, false),
  ];
  if (filters.sport)
    conditions.push(arrayContains(providerProfiles.categories, [filters.sport]));
  if (filters.specialty)
    conditions.push(
      arrayContains(providerProfiles.specialties, [filters.specialty])
    );
  if (filters.level)
    conditions.push(
      arrayContains(providerProfiles.athleteLevels, [filters.level])
    );
  if (filters.language)
    conditions.push(
      arrayContains(providerProfiles.languages, [filters.language])
    );
  if (filters.certifiedOnly)
    conditions.push(eq(providerProfiles.isKaipaiCertified, true));

  const rows = await db
    .select({
      providerId: providerProfiles.id,
      slug: providerProfiles.slug,
      displayName: profiles.displayName,
      headline: providerProfiles.headline,
      avatarUrl: profiles.avatarUrl,
      categories: providerProfiles.categories,
      specialties: providerProfiles.specialties,
      hourlyRate: providerProfiles.hourlyRate,
      currency: providerProfiles.currency,
      certified: providerProfiles.isKaipaiCertified,
      yearsExperience: providerProfiles.yearsExperience,
      languages: providerProfiles.languages,
      athleteLevels: providerProfiles.athleteLevels,
      videoUrl: providerProfiles.videoUrl,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(and(...conditions));

  const [ratings, experience] = await Promise.all([
    getRatingSummaries(rows.map((r) => r.providerId)),
    getCoachExperienceStats(rows.map((r) => r.providerId)),
  ]);
  const config = getVerticalConfig();
  const labelFor = (
    items: { key: string; label: string }[],
    key?: string
  ) => (key ? findTaxonomyItem(items, key)?.label ?? key : undefined);

  const scored = rows.map((r) => {
    const rating = ratings.get(r.providerId) ?? { average: null, count: 0 };
    const stats = experience.get(r.providerId) ?? {
      athletesCount: 0,
      totalMinutes: 0,
    };
    const hasVideo = !!r.videoUrl;

    // Quality score (drives "Consigliati" ranking).
    const score =
      (rating.average ?? 0) * 6 +
      Math.min(rating.count, 10) +
      (r.certified ? 25 : 0) +
      (hasVideo ? 8 : 0) +
      (r.headline ? 2 : 0) +
      ((r.specialties?.length ?? 0) > 0 ? 2 : 0) +
      ((r.languages?.length ?? 0) > 0 ? 1 : 0);

    // Match reasons (max 3): matched filters first, then quality signals.
    const reasons: string[] = [];
    if (filters.specialty && r.specialties?.includes(filters.specialty))
      reasons.push(
        `Esperto in: ${labelFor(specialtyItems, filters.specialty)}`
      );
    if (filters.level && r.athleteLevels?.includes(filters.level))
      reasons.push(
        `Lavora con: ${labelFor(config.taxonomies.levels ?? [], filters.level)}`
      );
    if (filters.language && r.languages?.includes(filters.language))
      reasons.push(`Parla ${filters.language}`);
    if (reasons.length < 3 && r.certified) reasons.push('Certificato KaiPai');
    if (reasons.length < 3 && rating.average != null)
      reasons.push(`★ ${rating.average}`);
    if (reasons.length < 3 && hasVideo) reasons.push('Video di presentazione');

    return {
      providerId: r.providerId,
      slug: r.slug as string,
      displayName: r.displayName,
      headline: r.headline,
      avatarUrl: r.avatarUrl,
      categories: r.categories,
      specialties: r.specialties,
      hourlyRate: r.hourlyRate,
      currency: r.currency,
      certified: r.certified,
      yearsExperience: r.yearsExperience,
      languages: r.languages,
      athleteLevels: r.athleteLevels,
      hasVideo,
      rating,
      matchReasons: reasons.slice(0, 3),
      recommended: false,
      isFavorite: opts.favoriteIds?.has(r.providerId) ?? false,
      athletesCount: stats.athletesCount,
      totalMinutes: stats.totalMinutes,
      _score: score,
    };
  });

  const sort = filters.sort ?? 'activity';
  scored.sort((a, b) => {
    // Favourites float to the top for the subjective ranking options.
    // The activity order is the exception: it stays objective for every visitor.
    if (sort !== 'activity' && a.isFavorite !== b.isFavorite) {
      return a.isFavorite ? -1 : 1;
    }
    switch (sort) {
      case 'activity':
        return (
          b.totalMinutes - a.totalMinutes ||
          b.athletesCount - a.athletesCount ||
          b._score - a._score ||
          (a.displayName ?? '').localeCompare(b.displayName ?? '', 'it')
        );
      case 'rating':
        return (
          (b.rating.average ?? -1) - (a.rating.average ?? -1) ||
          b.rating.count - a.rating.count
        );
      case 'price':
        return (
          (a.hourlyRate ?? Number.MAX_SAFE_INTEGER) -
          (b.hourlyRate ?? Number.MAX_SAFE_INTEGER)
        );
      case 'experience':
        return (b.yearsExperience ?? -1) - (a.yearsExperience ?? -1);
      default:
        return b._score - a._score || (b.rating.average ?? 0) - (a.rating.average ?? 0);
    }
  });

  // Highlight the top matches when ranked by relevance.
  if (sort === 'recommended') {
    scored.slice(0, 3).forEach((c) => {
      if (c._score > 0) c.recommended = true;
    });
  }

  return scored.map(({ _score, ...c }) => c);
}

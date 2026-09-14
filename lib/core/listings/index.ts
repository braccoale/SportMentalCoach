import { getAllSpecialties } from '@/lib/core/taxonomies';
import 'server-only';
import {
  and,
  arrayContains,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  lte,
  max,
  min,
  or,
  type SQL,
} from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  profiles,
  services,
  users,
} from '@/lib/db/schema';
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
 * Detail query for a single approved coach by slug, with their common profile
 * and active services. Demo coaches stay hidden from the public marketplace,
 * but an authenticated athlete can still open the profile of a coach with
 * whom they have a booking.
 */
export async function getCoachBySlug(
  slug: string,
  options: { viewerUserId?: number | null } = {}
): Promise<CoachDetail | null> {
  const demoVisibility = options.viewerUserId
    ? or(
        eq(users.isDemo, false),
        exists(
          db
            .select({ id: bookings.id })
            .from(bookings)
            .where(
              and(
                eq(bookings.providerId, providerProfiles.id),
                eq(bookings.clientId, options.viewerUserId)
              )
            )
        )
      )
    : eq(users.isDemo, false);

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
        demoVisibility
      )
    )
    .limit(1);

  if (!coach) return null;

  const stats = (await getCoachExperienceStats([coach.providerId])).get(
    coach.providerId
  ) ?? { athletesCount: 0, totalMinutes: 0, completedSessions: 0 };

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
        eq(services.isActive, true), eq(services.isIntro, false),
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
  | 'price_desc'
  | 'experience';

export type DiscoveryFilters = {
  sport?: string;
  specialty?: string;
  level?: string;
  language?: string;
  certifiedOnly?: boolean;
  sort?: DiscoverySort;
  /** In cents, inclusive — matched against each coach's primary service price
   * (the same one shown on their card), not the unused hourly rate. */
  priceMinCents?: number;
  priceMaxCents?: number;
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
  /** Distinct athletes coached, total coaching minutes and session count, from completed sessions. */
  athletesCount: number;
  totalMinutes: number;
  completedSessions: number;
  /** Active, non-intro services (ordered by id — the coach's own creation order). */
  services: {
    id: number;
    title: string | null;
    durationMin: number | null;
    price: number | null;
    currency: string;
  }[];
};

/**
 * Prezzo minimo e massimo (in cent) fra i servizi attivi, non-intro dei
 * coach approvati — i bordi dello slider "Prezzo a lezione". Su tutti i
 * servizi, non solo il principale di ciascun coach: per i bordi dello
 * slider l'approssimazione è innocua (al più lo slider parte un filo più
 * largo del necessario), mentre isolare "il primo servizio per coach"
 * richiederebbe una window function in più solo per questo. `null` quando
 * nessun coach ha ancora un servizio prezzato — lo slider resta nascosto.
 */
export async function getCoachPriceRangeCents(): Promise<{
  minCents: number;
  maxCents: number;
} | null> {
  const [row] = await db
    .select({ minPrice: min(services.price), maxPrice: max(services.price) })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(
      and(
        eq(providerProfiles.status, 'approved'),
        eq(users.isDemo, false),
        eq(services.isActive, true),
        eq(services.isIntro, false)
      )
    );
  if (row?.minPrice == null || row?.maxPrice == null) return null;
  return { minCents: row.minPrice, maxCents: row.maxPrice };
}

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

  const [ratings, experience, serviceRows] = await Promise.all([
    getRatingSummaries(rows.map((r) => r.providerId)),
    getCoachExperienceStats(rows.map((r) => r.providerId)),
    db
      .select({
        providerId: services.providerId,
        id: services.id,
        title: services.title,
        durationMin: services.durationMin,
        price: services.price,
        currency: services.currency,
      })
      .from(services)
      .where(
        and(
          inArray(
            services.providerId,
            rows.map((r) => r.providerId)
          ),
          eq(services.isActive, true),
          eq(services.isIntro, false)
        )
      )
      .orderBy(services.id),
  ]);
  const servicesByProvider = new Map<number, typeof serviceRows>();
  for (const s of serviceRows) {
    const list = servicesByProvider.get(s.providerId) ?? [];
    list.push(s);
    servicesByProvider.set(s.providerId, list);
  }
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
      completedSessions: 0,
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
      completedSessions: stats.completedSessions,
      services: servicesByProvider.get(r.providerId) ?? [],
      _score: score,
    };
  });

  // Prezzo a lezione: filtra sul prezzo del servizio principale, lo stesso
  // mostrato sulla card — non sulla tariffa oraria, inutilizzata dietro
  // SHOW_COACH_HOURLY_RATE. Un coach senza un servizio prezzato non può
  // essere confermato dentro la fascia, quindi resta fuori quando il filtro
  // è attivo.
  const priced =
    filters.priceMinCents == null && filters.priceMaxCents == null
      ? scored
      : scored.filter((c) => {
          const price = c.services[0]?.price;
          if (price == null) return false;
          if (filters.priceMinCents != null && price < filters.priceMinCents)
            return false;
          if (filters.priceMaxCents != null && price > filters.priceMaxCents)
            return false;
          return true;
        });

  const sort = filters.sort ?? 'activity';
  priced.sort((a, b) => {
    // Favourites float to the top under every sort, "activity" (the
    // default view) included: a coach an athlete already saved is the one
    // they came back to find, not one to bury under whoever ranks higher
    // this week.
    if (a.isFavorite !== b.isFavorite) {
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
      case 'price_desc':
        return (
          (b.hourlyRate ?? -1) - (a.hourlyRate ?? -1)
        );
      case 'experience':
        return (b.yearsExperience ?? -1) - (a.yearsExperience ?? -1);
      default:
        return b._score - a._score || (b.rating.average ?? 0) - (a.rating.average ?? 0);
    }
  });

  // Highlight the top matches when ranked by relevance.
  if (sort === 'recommended') {
    priced.slice(0, 3).forEach((c) => {
      if (c._score > 0) c.recommended = true;
    });
  }

  return priced.map(({ _score, ...c }) => c);
}

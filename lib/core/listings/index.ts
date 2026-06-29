import 'server-only';
import { and, arrayContains, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { providerProfiles, profiles, services } from '@/lib/db/schema';

export type CoachListItem = {
  slug: string;
  displayName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  categories: string[] | null;
  specialties: string[] | null;
  hourlyRate: number | null;
  currency: string;
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
    })
    .from(providerProfiles)
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(and(...conditions))
    .orderBy(providerProfiles.id);

  // slug is guaranteed non-null by the isNotNull filter above.
  return rows as CoachListItem[];
}

export type CoachDetail = CoachListItem & {
  bio: string | null;
  description: string | null;
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
      id: providerProfiles.id,
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
    })
    .from(providerProfiles)
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(
      and(
        eq(providerProfiles.slug, slug),
        eq(providerProfiles.status, 'approved')
      )
    )
    .limit(1);

  if (!coach) return null;

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
    .where(and(eq(services.providerId, coach.id), eq(services.isActive, true)))
    .orderBy(services.id);

  const { id: _id, ...rest } = coach;
  return { ...(rest as CoachListItem), bio: coach.bio, description: coach.description, services: svc };
}

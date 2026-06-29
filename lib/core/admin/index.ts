import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  providerProfiles,
  profiles,
  users,
  type ProviderStatus,
} from '@/lib/db/schema';

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
  reviewedAt: Date | null;
  createdAt: Date;
};

/**
 * All provider profiles for admin review, across every status
 * (draft / pending / approved / rejected), newest first.
 */
export async function getProviderProfilesForReview(): Promise<
  ProviderReviewItem[]
> {
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
      reviewedAt: providerProfiles.reviewedAt,
      createdAt: providerProfiles.createdAt,
    })
    .from(providerProfiles)
    .innerJoin(users, eq(providerProfiles.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .orderBy(desc(providerProfiles.createdAt));
}

type Result =
  | { ok: true }
  | { ok: false; error: string };

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
    })
    .where(eq(providerProfiles.id, params.providerId))
    .returning({ id: providerProfiles.id });

  if (!updated) {
    return { ok: false, error: 'Profilo non trovato.' };
  }

  return { ok: true };
}

import 'server-only';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  reviews,
  bookings,
  profiles,
  users,
  providerProfiles,
} from '@/lib/db/schema';
import type { Result } from '@/lib/core/result';
import { notify } from '@/lib/core/notifications';

export type ReviewSummary = { count: number; average: number | null };

export type ReviewView = {
  id: number;
  rating: number;
  body: string | null;
  createdAt: Date;
  authorName: string;
  verified: boolean;
  reply: string | null;
  replyAt: Date | null;
};

/** Aggregate rating for a coach (by provider id). */
export async function getReviewSummary(
  providerId: number
): Promise<ReviewSummary> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      average: sql<number | null>`round(avg(${reviews.rating})::numeric, 1)`,
    })
    .from(reviews)
    .where(eq(reviews.providerId, providerId));
  return {
    count: row?.count ?? 0,
    average: row?.average != null ? Number(row.average) : null,
  };
}

/** Aggregate ratings for many providers at once (for the listing). */
export async function getRatingSummaries(
  providerIds: number[]
): Promise<Map<number, ReviewSummary>> {
  const map = new Map<number, ReviewSummary>();
  if (providerIds.length === 0) return map;
  const rows = await db
    .select({
      providerId: reviews.providerId,
      count: sql<number>`count(*)::int`,
      average: sql<number | null>`round(avg(${reviews.rating})::numeric, 1)`,
    })
    .from(reviews)
    .where(inArray(reviews.providerId, providerIds))
    .groupBy(reviews.providerId);
  for (const r of rows) {
    map.set(r.providerId, {
      count: r.count,
      average: r.average != null ? Number(r.average) : null,
    });
  }
  return map;
}

/** Aggregate rating for a coach by slug (approved only). */
export async function getReviewSummaryBySlug(
  slug: string
): Promise<ReviewSummary> {
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(
      and(eq(providerProfiles.slug, slug), eq(providerProfiles.status, 'approved'))
    )
    .limit(1);
  if (!provider) return { count: 0, average: null };
  return getReviewSummary(provider.id);
}

/** Recent reviews for a coach, with the author's display name. */
export async function getCoachReviews(
  providerId: number,
  limit = 20
): Promise<ReviewView[]> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      createdAt: reviews.createdAt,
      bookingId: reviews.bookingId,
      reply: reviews.reply,
      replyAt: reviews.replyAt,
      displayName: profiles.displayName,
      name: users.name,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.authorId, users.id))
    .leftJoin(profiles, eq(profiles.userId, reviews.authorId))
    .where(eq(reviews.providerId, providerId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    createdAt: r.createdAt,
    authorName: r.displayName || r.name || 'Atleta',
    verified: r.bookingId != null,
    reply: r.reply,
    replyAt: r.replyAt,
  }));
}

/**
 * A coach replies to (or edits the reply on) a review of their own profile.
 * Ownership-scoped: the review must belong to the coach's provider profile.
 */
export async function replyToReview(params: {
  reviewId: number;
  coachUserId: number;
  reply: string;
}): Promise<Result> {
  const text = params.reply.trim();
  if (!text) return { ok: false, error: 'La risposta non può essere vuota.' };
  if (text.length > 2000) {
    return { ok: false, error: 'Risposta troppo lunga.' };
  }

  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, params.coachUserId))
    .limit(1);
  if (!provider) return { ok: false, error: 'Profilo coach non trovato.' };

  const [updated] = await db
    .update(reviews)
    .set({ reply: text, replyAt: new Date(), updatedBy: params.coachUserId })
    .where(
      and(eq(reviews.id, params.reviewId), eq(reviews.providerId, provider.id))
    )
    .returning({ id: reviews.id });

  if (!updated) return { ok: false, error: 'Recensione non trovata.' };
  return { ok: true };
}

/** Booking ids the user has already reviewed (for dashboard CTA gating). */
export async function getReviewedBookingIds(
  userId: number
): Promise<Set<number>> {
  const rows = await db
    .select({ bookingId: reviews.bookingId })
    .from(reviews)
    .where(and(eq(reviews.authorId, userId), isNotNull(reviews.bookingId)));
  return new Set(rows.map((r) => r.bookingId!).filter((id) => id != null));
}

/**
 * Creates a verified review from the athlete who owns a completed booking.
 * One review per booking (enforced by the unique constraint).
 */
export async function createReview(params: {
  bookingId: number;
  authorUserId: number;
  rating: number;
  body?: string | null;
}): Promise<Result> {
  if (
    !Number.isInteger(params.rating) ||
    params.rating < 1 ||
    params.rating > 5
  ) {
    return { ok: false, error: 'Seleziona una valutazione da 1 a 5 stelle.' };
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      clientId: bookings.clientId,
      providerId: bookings.providerId,
      status: bookings.status,
      coachUserId: providerProfiles.userId,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .where(eq(bookings.id, params.bookingId))
    .limit(1);

  if (!booking || booking.clientId !== params.authorUserId) {
    return { ok: false, error: 'Prenotazione non trovata.' };
  }
  if (booking.status !== 'completed') {
    return {
      ok: false,
      error: 'Puoi recensire solo le sessioni completate.',
    };
  }

  const [created] = await db
    .insert(reviews)
    .values({
      providerId: booking.providerId,
      bookingId: booking.id,
      authorId: params.authorUserId,
      rating: params.rating,
      body: params.body?.trim() || null,
      createdBy: params.authorUserId,
    })
    .onConflictDoNothing({ target: reviews.bookingId })
    .returning({ id: reviews.id });

  if (!created) {
    return { ok: false, error: 'Hai già recensito questa sessione.' };
  }

  await notify('review_received', booking.coachUserId, {
    rating: params.rating,
  });

  return { ok: true };
}

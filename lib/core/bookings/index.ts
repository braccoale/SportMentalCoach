import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  profiles,
  services,
  users,
  type BookingStatus,
} from '@/lib/db/schema';
import { getVerticalConfig, t } from '@/lib/core/config';
import type { Result } from '@/lib/core/result';

/** Localized label for a booking status (from the vertical copy). */
export function bookingStatusLabel(status: string): string {
  return t(`booking.status.${status}`, getVerticalConfig());
}

/** Tailwind tone classes for a booking status badge. */
export function bookingStatusTone(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-green-50 text-green-700';
    case 'declined':
    case 'cancelled':
      return 'bg-red-50 text-red-700';
    case 'completed':
      return 'bg-blue-50 text-blue-700';
    default:
      return 'bg-amber-50 text-amber-700';
  }
}

/**
 * Allowed booking status transitions (enforced here, never in the UI).
 * Phase 1 exercises only `requested → accepted | declined`.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ['accepted', 'declined', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  declined: [],
  cancelled: [],
  completed: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Creates a `requested` booking from an athlete to an approved coach (by slug).
 * An optional service may be attached; it must belong to that coach.
 */
export async function createBookingRequest(params: {
  clientUserId: number;
  providerSlug: string;
  serviceId?: number | null;
  note?: string | null;
  scheduledFor?: Date | null;
}): Promise<Result<{ bookingId: number }>> {
  const [provider] = await db
    .select({ id: providerProfiles.id, userId: providerProfiles.userId })
    .from(providerProfiles)
    .where(
      and(
        eq(providerProfiles.slug, params.providerSlug),
        eq(providerProfiles.status, 'approved')
      )
    )
    .limit(1);

  if (!provider) {
    return { ok: false, error: 'Coach non trovato o non disponibile.' };
  }

  if (provider.userId === params.clientUserId) {
    return { ok: false, error: 'Non puoi prenotare una sessione con te stesso.' };
  }

  let serviceId: number | null = null;
  if (params.serviceId != null) {
    const [svc] = await db
      .select({ id: services.id })
      .from(services)
      .where(
        and(
          eq(services.id, params.serviceId),
          eq(services.providerId, provider.id)
        )
      )
      .limit(1);
    if (!svc) {
      return { ok: false, error: 'Servizio non valido per questo coach.' };
    }
    serviceId = svc.id;
  }

  const [created] = await db
    .insert(bookings)
    .values({
      clientId: params.clientUserId,
      providerId: provider.id,
      serviceId,
      status: 'requested',
      note: params.note ?? null,
      scheduledFor: params.scheduledFor ?? null,
    })
    .returning({ id: bookings.id });

  return { ok: true, bookingId: created.id };
}

export type AthleteBooking = {
  id: number;
  status: string;
  note: string | null;
  scheduledFor: Date | null;
  requestedAt: Date;
  decidedAt: Date | null;
  coachName: string | null;
  coachSlug: string | null;
  serviceTitle: string | null;
};

/** Bookings made by an athlete, with coach + service display info. */
export async function getAthleteBookings(
  userId: number
): Promise<AthleteBooking[]> {
  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      note: bookings.note,
      scheduledFor: bookings.scheduledFor,
      requestedAt: bookings.requestedAt,
      decidedAt: bookings.decidedAt,
      coachName: profiles.displayName,
      coachSlug: providerProfiles.slug,
      serviceTitle: services.title,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.clientId, userId))
    .orderBy(desc(bookings.requestedAt));
}

export type CoachBooking = {
  id: number;
  status: string;
  note: string | null;
  scheduledFor: Date | null;
  requestedAt: Date;
  decidedAt: Date | null;
  clientName: string | null;
  clientEmail: string;
  serviceTitle: string | null;
};

/** Incoming bookings for a coach (resolved from their user id). */
export async function getCoachBookings(
  userId: number
): Promise<CoachBooking[]> {
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);

  if (!provider) return [];

  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      note: bookings.note,
      scheduledFor: bookings.scheduledFor,
      requestedAt: bookings.requestedAt,
      decidedAt: bookings.decidedAt,
      clientName: users.name,
      clientEmail: users.email,
      serviceTitle: services.title,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.providerId, provider.id))
    .orderBy(desc(bookings.requestedAt));
}

/**
 * Coach decision on a pending request. Verifies ownership and that the booking
 * is still `requested` before transitioning to `accepted` / `declined`.
 */
export async function decideBooking(params: {
  bookingId: number;
  coachUserId: number;
  decision: 'accepted' | 'declined';
}): Promise<Result> {
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, params.coachUserId))
    .limit(1);

  if (!provider) {
    return { ok: false, error: 'Profilo coach non trovato.' };
  }

  const [booking] = await db
    .select({ id: bookings.id, providerId: bookings.providerId, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, params.bookingId))
    .limit(1);

  if (!booking || booking.providerId !== provider.id) {
    return { ok: false, error: 'Richiesta non trovata.' };
  }

  if (!canTransition(booking.status as BookingStatus, params.decision)) {
    return { ok: false, error: 'La richiesta non è più modificabile.' };
  }

  await db
    .update(bookings)
    .set({ status: params.decision, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, params.bookingId));

  return { ok: true };
}

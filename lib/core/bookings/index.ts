import 'server-only';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  clientProfiles,
  coachAvailability,
  favorites,
  providerProfiles,
  profiles,
  services,
  userRoles,
  users,
  type BookingStatus,
} from '@/lib/db/schema';
import { getVerticalConfig, t } from '@/lib/core/config';
import { resolveDisplayName } from '@/lib/core/format';
import { notify } from '@/lib/core/notifications';
import {
  REQUEST_RESPONSE_WINDOW_HOURS,
  isSessionJoinable,
} from '@/lib/core/sessions';
import {
  getCoachAvailabilityByProviderId,
  isWithinAvailability,
  describeAvailability,
  getBookableDays,
  type BookableDay,
} from '@/lib/core/availability';
import {
  canBookSessions,
  ageFromBirthDate,
  requiresGuardian,
} from '@/lib/core/guardians';
import type { Result } from '@/lib/core/result';
import { MAX_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';

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
    case 'expired':
      return 'bg-amber-50 text-amber-700';
    case 'completed':
      return 'bg-blue-50 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

/**
 * Allowed booking status transitions (enforced here, never in the UI).
 * Phase 1 exercises only `requested → accepted | declined`.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ['accepted', 'declined', 'expired', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  declined: [],
  expired: [],
  cancelled: [],
  completed: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

// Throttle the lazy sweep so it doesn't fire a write on every single read.
// Module-level, so warm serverless instances reuse it; multiple instances just
// each sweep once per window (harmless — the UPDATE is idempotent).
let lastExpiryRun = 0;
const EXPIRY_THROTTLE_MS = 60_000;

/**
 * Auto-declines pending (`requested`) bookings the coach never answered in
 * time — either the requested session time has passed, or the response window
 * elapsed. Runs lazily on booking reads (no cron infrastructure needed), but
 * at most once per minute: the guarded `status = 'requested'` UPDATE is
 * idempotent and returns only the rows it flipped, so athletes are notified
 * exactly once.
 */
export async function expireStaleRequests(): Promise<void> {
  const now = Date.now();
  if (now - lastExpiryRun < EXPIRY_THROTTLE_MS) return;
  lastExpiryRun = now;

  const expired = await db
    .update(bookings)
    .set({ status: 'expired', decidedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(bookings.status, 'requested'),
        sql`(
          (${bookings.scheduledFor} is not null and ${bookings.scheduledFor} < now())
          or ${bookings.requestedAt} < now() - (${REQUEST_RESPONSE_WINDOW_HOURS} * interval '1 hour')
        )`
      )
    )
    .returning({ id: bookings.id, clientId: bookings.clientId });

  for (const b of expired) {
    await notify('booking_declined', b.clientId, {
      bookingId: b.id,
      expired: true,
    });
  }
}

export type CoachExperienceStats = {
  athletesCount: number;
  totalMinutes: number;
};

/**
 * Aggregate "experience" trust signals for one or more coaches — distinct
 * athletes coached and total coaching time delivered, both derived only from
 * `completed` sessions. Uses the real call duration (session heartbeat span)
 * when available, falling back to the booked service's planned duration
 * otherwise (older completions predate the heartbeat, or had no video call).
 */
export async function getCoachExperienceStats(
  providerIds: number[]
): Promise<Map<number, CoachExperienceStats>> {
  if (providerIds.length === 0) return new Map();

  const rows = await db
    .select({
      providerId: bookings.providerId,
      athletesCount: sql<number>`count(distinct ${bookings.clientId})::int`,
      // `greatest(…, 0)` guards against rows written before `completeBooking`
      // clamped its derived span: a negative duration must never subtract from
      // a coach's total.
      totalMinutes: sql<number>`coalesce(sum(
        greatest(
          case
            when ${bookings.sessionStartedAt} is not null and ${bookings.sessionEndedAt} is not null
              then extract(epoch from (${bookings.sessionEndedAt} - ${bookings.sessionStartedAt})) / 60
            else coalesce(${services.durationMin}, 0)
          end,
          0
        )
      ), 0)::int`,
    })
    .from(bookings)
    .leftJoin(services, eq(services.id, bookings.serviceId))
    .where(
      and(
        eq(bookings.status, 'completed'),
        inArray(bookings.providerId, providerIds)
      )
    )
    .groupBy(bookings.providerId);

  return new Map(
    rows.map((r) => [
      r.providerId,
      { athletesCount: r.athletesCount, totalMinutes: r.totalMinutes },
    ])
  );
}

/** Number of completed sessions for a coach (social-proof credibility). */
export async function getCompletedSessionCount(
  providerId: number
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(bookings)
    .where(
      and(eq(bookings.providerId, providerId), eq(bookings.status, 'completed'))
    );
  return row?.value ?? 0;
}

/** Number of pending (`requested`) bookings for a coach, by user id. */
export async function getPendingRequestCount(userId: number): Promise<number> {
  await expireStaleRequests();
  const [row] = await db
    .select({ value: count() })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .where(
      and(
        eq(providerProfiles.userId, userId),
        eq(bookings.status, 'requested')
      )
    );
  return row?.value ?? 0;
}

/**
 * Creates a `requested` booking from an athlete to an approved coach (by slug).
 * A bookable service is mandatory and must belong to that coach. Its duration
 * is configured by the coach, never supplied by the athlete.
 */
export async function createBookingRequest(params: {
  clientUserId: number;
  providerSlug: string;
  serviceId: number;
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

  // An athlete aged 15-17 cannot enter into a session until their guardian has
  // authorised it: the booking is where the obligation arises, and a minor
  // cannot validly conclude it on their own (art. 1425 c.c.).
  const guardian = await canBookSessions(params.clientUserId);
  if (!guardian.ok) return guardian;

  if (params.scheduledFor) {
    const slots = await getCoachAvailabilityByProviderId(provider.id);
    if (!isWithinAvailability(slots, params.scheduledFor)) {
      return {
        ok: false,
        error: `Il coach è disponibile solo in questi orari: ${describeAvailability(slots)}. Scegli un orario in questa fascia.`,
      };
    }
  }

  if (!Number.isInteger(params.serviceId) || params.serviceId <= 0) {
    return { ok: false, error: 'Seleziona un servizio.' };
  }
  const [svc] = await db
    .select({ id: services.id, title: services.title })
    .from(services)
    .where(
      and(
        eq(services.id, params.serviceId),
        eq(services.providerId, provider.id),
        eq(services.isActive, true),
        gt(services.durationMin, 0),
        lte(services.durationMin, MAX_SERVICE_DURATION_MIN)
      )
    )
    .limit(1);
  if (!svc) {
    return {
      ok: false,
      error: 'Il servizio selezionato non è disponibile o non ha una durata.',
    };
  }

  const [created] = await db
    .insert(bookings)
    .values({
      clientId: params.clientUserId,
      providerId: provider.id,
      serviceId: svc.id,
      status: 'requested',
      note: params.note ?? null,
      scheduledFor: params.scheduledFor ?? null,
      createdBy: params.clientUserId,
    })
    .returning({ id: bookings.id });

  await notify('booking_requested', provider.userId, {
    serviceTitle: svc.title,
    bookingId: created.id,
  });

  return { ok: true, bookingId: created.id };
}

export type AthleteBooking = {
  id: number;
  status: string;
  note: string | null;
  scheduledFor: Date | null;
  requestedAt: Date;
  decidedAt: Date | null;
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  coachName: string | null;
  coachAvatarUrl: string | null;
  coachSlug: string | null;
  serviceTitle: string | null;
  serviceDurationMin: number | null;
};

export type ParticipantBooking = {
  id: number;
  status: string;
  scheduledFor: Date | null;
  serviceTitle: string | null;
  serviceDurationMin: number | null;
  coachName: string | null;
  athleteName: string | null;
  viewerRole: 'athlete' | 'coach';
};

/**
 * Minimal, privacy-safe projection for the authenticated appointment detail.
 * The participant predicate is part of the database query so callers cannot
 * use a guessed id to retrieve somebody else's booking.
 */
export async function getParticipantBooking(
  bookingId: number,
  userId: number
): Promise<ParticipantBooking | null> {
  if (!Number.isInteger(bookingId) || bookingId <= 0) return null;

  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      scheduledFor: bookings.scheduledFor,
      serviceTitle: services.title,
      serviceDurationMin: services.durationMin,
      clientId: bookings.clientId,
      providerUserId: providerProfiles.userId,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        eq(bookings.id, bookingId),
        or(
          eq(bookings.clientId, userId),
          eq(providerProfiles.userId, userId)
        )
      )
    )
    .limit(1);

  if (!booking) return null;

  const [[coach], [athlete]] = await Promise.all([
    db
      .select({ name: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.userId, booking.providerUserId))
      .limit(1),
    db
      .select({
        name: sql<string | null>`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
      })
      .from(users)
      .where(eq(users.id, booking.clientId))
      .limit(1),
  ]);

  return {
    id: booking.id,
    status: booking.status,
    scheduledFor: booking.scheduledFor,
    serviceTitle: booking.serviceTitle,
    serviceDurationMin: booking.serviceDurationMin,
    coachName: coach?.name ?? null,
    athleteName: athlete?.name ?? null,
    viewerRole: booking.clientId === userId ? 'athlete' : 'coach',
  };
}

export type RelationshipCoach = {
  slug: string;
  name: string;
  avatarUrl: string | null;
  services: { id: number; title: string; durationMin: number }[];
  /** Compact weekly availability summary, e.g. "Lun 09:00–18:00"; empty if none configured. */
  availabilityHint: string;
  /** Selectable day/time options from that availability; empty if none configured. */
  bookableDays: BookableDay[];
};

/**
 * Approved coaches an athlete already has a relationship with — coaches they
 * have booked before or favourited — each with their active services. Powers
 * the "Nuovo appuntamento" quick-rebook flow (a scoped alternative to browsing
 * the whole marketplace). Returns an empty array when there is no relationship
 * yet (the UI then routes the athlete to discovery).
 */
export async function getAthleteRelationshipCoaches(
  userId: number
): Promise<RelationshipCoach[]> {
  // Providers from prior bookings (with recency) ∪ favourites.
  const [booked, faved] = await Promise.all([
    db
      .select({
        providerId: bookings.providerId,
        lastAt: sql<Date>`max(${bookings.requestedAt})`,
      })
      .from(bookings)
      .where(eq(bookings.clientId, userId))
      .groupBy(bookings.providerId),
    db
      .select({ providerId: favorites.providerId })
      .from(favorites)
      .where(eq(favorites.userId, userId)),
  ]);

  // Most-recent booking time per provider, to surface the last-followed coach first.
  const lastByProvider = new Map<number, number>();
  for (const b of booked) {
    lastByProvider.set(b.providerId, new Date(b.lastAt).getTime());
  }
  const favedIds = new Set(faved.map((r) => r.providerId));

  const providerIds = [
    ...new Set([
      ...booked.map((r) => r.providerId),
      ...faved.map((r) => r.providerId),
    ]),
  ];
  if (providerIds.length === 0) return [];

  const [coaches, svc, avail] = await Promise.all([
    db
      .select({
        id: providerProfiles.id,
        slug: providerProfiles.slug,
        name: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(providerProfiles)
      .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
      .where(
        and(
          inArray(providerProfiles.id, providerIds),
          eq(providerProfiles.status, 'approved')
        )
      ),
    db
      .select({
        providerId: services.providerId,
        id: services.id,
        title: services.title,
        durationMin: services.durationMin,
      })
      .from(services)
      .where(
        and(
          inArray(services.providerId, providerIds),
          eq(services.isActive, true),
          gt(services.durationMin, 0),
          lte(services.durationMin, MAX_SERVICE_DURATION_MIN)
        )
      ),
    db
      .select({
        providerId: coachAvailability.providerId,
        weekday: coachAvailability.weekday,
        startMinute: coachAvailability.startMinute,
        endMinute: coachAvailability.endMinute,
      })
      .from(coachAvailability)
      .where(inArray(coachAvailability.providerId, providerIds))
      .orderBy(asc(coachAvailability.weekday), asc(coachAvailability.startMinute)),
  ]);

  const servicesByProvider = new Map<
    number,
    { id: number; title: string; durationMin: number }[]
  >();
  for (const s of svc) {
    if (!s.title || s.durationMin == null) continue;
    const list = servicesByProvider.get(s.providerId) ?? [];
    list.push({ id: s.id, title: s.title, durationMin: s.durationMin });
    servicesByProvider.set(s.providerId, list);
  }

  const availByProvider = new Map<number, typeof avail>();
  for (const a of avail) {
    const list = availByProvider.get(a.providerId) ?? [];
    list.push(a);
    availByProvider.set(a.providerId, list);
  }

  return coaches
    .filter((c) => c.slug)
    .map((c) => ({
      slug: c.slug!,
      name: c.name ?? 'Coach',
      avatarUrl: c.avatarUrl,
      services: servicesByProvider.get(c.id) ?? [],
      availabilityHint: describeAvailability(availByProvider.get(c.id) ?? []),
      bookableDays: getBookableDays(availByProvider.get(c.id) ?? []),
      _favorite: favedIds.has(c.id),
      _recency: lastByProvider.get(c.id) ?? 0,
    }))
    // Favourited coaches float to the top; then last-followed first;
    // favourited-only coaches (no booking) alphabetically after that.
    .sort(
      (a, b) =>
        (b._favorite ? 1 : 0) - (a._favorite ? 1 : 0) ||
        b._recency - a._recency ||
        a.name.localeCompare(b.name)
    )
    .map(({ _recency, _favorite, ...c }) => c);
}

export type RelationshipAthlete = {
  userId: number;
  name: string;
  avatarUrl: string | null;
};

/**
 * Athletes a coach already has a relationship with — people who have booked a
 * session with them before. Powers the coach-side "Nuovo appuntamento" quick
 * flow, symmetric to `getAthleteRelationshipCoaches`: a coach can only
 * schedule directly with an athlete they've already worked with, never an
 * arbitrary user.
 */
export async function getCoachRelationshipAthletes(
  userId: number
): Promise<RelationshipAthlete[]> {
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);
  if (!provider) return [];

  const booked = await db
    .select({
      clientId: bookings.clientId,
      lastAt: sql<Date>`max(${bookings.requestedAt})`,
    })
    .from(bookings)
    .where(eq(bookings.providerId, provider.id))
    .groupBy(bookings.clientId);
  if (booked.length === 0) return [];

  const clientIds = booked.map((b) => b.clientId);
  const lastByClient = new Map(
    booked.map((b) => [b.clientId, new Date(b.lastAt).getTime()])
  );

  const rows = await db
    .select({
      userId: users.id,
      name: sql<string | null>`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
      email: users.email,
      avatarUrl: profiles.avatarUrl,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(inArray(users.id, clientIds));

  return rows
    .map((r) => ({
      userId: r.userId,
      name: resolveDisplayName(r.name, r.email),
      avatarUrl: r.avatarUrl,
      _recency: lastByClient.get(r.userId) ?? 0,
    }))
    .sort((a, b) => b._recency - a._recency || a.name.localeCompare(b.name))
    .map(({ _recency, ...a }) => a);
}

/**
 * Every athlete registered on the platform — all users holding the `athlete`
 * role, regardless of whether this coach has worked with them before. Powers
 * the coach-side "Nuovo appuntamento" picker so a coach can open a session with
 * any athlete, not only prior clients. Safeguarding is still enforced at
 * booking time: `createCoachBookingRequest` rejects minors without a confirmed
 * guardian.
 */
export async function getAllAthletes(): Promise<RelationshipAthlete[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: sql<string | null>`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
      email: users.email,
      avatarUrl: profiles.avatarUrl,
    })
    .from(users)
    .innerJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), eq(userRoles.roleKey, 'athlete'))
    )
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(isNull(users.deletedAt));

  return rows
    .map((r) => ({
      userId: r.userId,
      name: resolveDisplayName(r.name, r.email),
      avatarUrl: r.avatarUrl,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Creates a session directly from the coach's side, for an athlete they have
 * already worked with. Unlike `createBookingRequest` (athlete → coach,
 * `requested`), this is created as `accepted` right away: the coach is the
 * one being booked, so there's nothing to accept. The athlete is notified and
 * can still cancel via the normal flow if the time doesn't work for them.
 */
export async function createCoachBookingRequest(params: {
  coachUserId: number;
  clientUserId: number;
  serviceId: number;
  note?: string | null;
  scheduledFor?: Date | null;
}): Promise<Result<{ bookingId: number }>> {
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, params.coachUserId))
    .limit(1);
  if (!provider) {
    return { ok: false, error: 'Profilo coach non trovato.' };
  }

  // Safety: the target must be a registered athlete. The picker now lists every
  // athlete (not just prior clients), so this guards against scheduling a
  // session for an arbitrary user id (e.g. another coach or an admin).
  const [athlete] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, params.clientUserId),
        eq(userRoles.roleKey, 'athlete')
      )
    )
    .limit(1);
  if (!athlete) {
    return { ok: false, error: 'Puoi creare una sessione solo con un atleta registrato.' };
  }

  // The same authorisation gate as the athlete-initiated path: a coach must
  // not be able to schedule around a missing parental consent.
  const guardian = await canBookSessions(params.clientUserId);
  if (!guardian.ok) {
    return {
      ok: false,
      error:
        'Questo atleta è minorenne e non ha ancora l’autorizzazione del genitore o tutore. Non puoi fissare una sessione finché non viene confermata.',
    };
  }

  if (params.scheduledFor) {
    const slots = await getCoachAvailabilityByProviderId(provider.id);
    if (!isWithinAvailability(slots, params.scheduledFor)) {
      return {
        ok: false,
        error: `Questo orario è fuori dalla tua disponibilità settimanale: ${describeAvailability(slots)}. Scegli un orario in questa fascia o aggiornala in "Disponibilità".`,
      };
    }
  }

  if (!Number.isInteger(params.serviceId) || params.serviceId <= 0) {
    return { ok: false, error: 'Seleziona un servizio.' };
  }
  const [svc] = await db
    .select({ id: services.id, title: services.title })
    .from(services)
    .where(
      and(
        eq(services.id, params.serviceId),
        eq(services.providerId, provider.id),
        eq(services.isActive, true),
        gt(services.durationMin, 0),
        lte(services.durationMin, MAX_SERVICE_DURATION_MIN)
      )
    )
    .limit(1);
  if (!svc) {
    return {
      ok: false,
      error: 'Il servizio selezionato non è disponibile o non ha una durata.',
    };
  }

  const [created] = await db
    .insert(bookings)
    .values({
      clientId: params.clientUserId,
      providerId: provider.id,
      serviceId: svc.id,
      status: 'accepted',
      note: params.note ?? null,
      scheduledFor: params.scheduledFor ?? null,
      createdBy: params.coachUserId,
      decidedAt: new Date(),
    })
    .returning({ id: bookings.id });

  await notify('booking_accepted', params.clientUserId, {
    serviceTitle: svc.title,
    bookingId: created.id,
  });

  return { ok: true, bookingId: created.id };
}

/** Bookings made by an athlete, with coach + service display info. */
export async function getAthleteBookings(
  userId: number
): Promise<AthleteBooking[]> {
  await expireStaleRequests();
  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      note: bookings.note,
      scheduledFor: bookings.scheduledFor,
      requestedAt: bookings.requestedAt,
      decidedAt: bookings.decidedAt,
      sessionStartedAt: bookings.sessionStartedAt,
      sessionEndedAt: bookings.sessionEndedAt,
      coachName: profiles.displayName,
      coachAvatarUrl: profiles.avatarUrl,
      coachSlug: providerProfiles.slug,
      serviceTitle: services.title,
      serviceDurationMin: services.durationMin,
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
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  clientName: string | null;
  clientEmail: string;
  clientAvatarUrl: string | null;
  athleteSport: string | null;
  athleteLevel: string | null;
  athleteGoals: string | null;
  serviceTitle: string | null;
  serviceDurationMin: number | null;
  /** True when the athlete is 15-17. The coach needs to know before the call. */
  athleteIsMinor: boolean;
};

/** Incoming bookings for a coach (resolved from their user id). */
export async function getCoachBookings(
  userId: number
): Promise<CoachBooking[]> {
  await expireStaleRequests();
  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);

  if (!provider) return [];

  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      note: bookings.note,
      scheduledFor: bookings.scheduledFor,
      requestedAt: bookings.requestedAt,
      decidedAt: bookings.decidedAt,
      sessionStartedAt: bookings.sessionStartedAt,
      sessionEndedAt: bookings.sessionEndedAt,
      clientName: sql<string | null>`nullif(trim(concat(${users.name}, ' ', coalesce(${users.lastName}, ''))), '')`,
      clientEmail: users.email,
      clientAvatarUrl: profiles.avatarUrl,
      athleteSport: clientProfiles.category,
      athleteLevel: clientProfiles.level,
      athleteGoals: clientProfiles.goals,
      athleteBirthDate: clientProfiles.birthDate,
      serviceTitle: services.title,
      serviceDurationMin: services.durationMin,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.clientId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.providerId, provider.id))
    .orderBy(desc(bookings.requestedAt));

  // Derive the minor flag here rather than exposing the birth date: the coach
  // needs to know they are working with a 15-17 year old, not their birthday.
  return rows.map(({ athleteBirthDate, ...b }) => ({
    ...b,
    athleteIsMinor: requiresGuardian(ageFromBirthDate(athleteBirthDate)),
  }));
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
    .select({
      id: bookings.id,
      providerId: bookings.providerId,
      clientId: bookings.clientId,
      status: bookings.status,
    })
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
    .set({ status: params.decision, decidedAt: new Date(), updatedAt: new Date(), updatedBy: params.coachUserId })
    .where(eq(bookings.id, params.bookingId));

  if (params.decision === 'accepted') {
    await notify('booking_accepted', booking.clientId, {
      bookingId: booking.id,
    });
  } else {
    await notify('booking_declined', booking.clientId, {
      bookingId: booking.id,
    });
  }

  return { ok: true };
}

/**
 * Coach marks an `accepted` booking as `completed`. Ownership + transition
 * (`accepted → completed`) enforced.
 */
export async function completeBooking(params: {
  bookingId: number;
  coachUserId: number;
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
    .select({
      id: bookings.id,
      providerId: bookings.providerId,
      clientId: bookings.clientId,
      status: bookings.status,
      scheduledFor: bookings.scheduledFor,
      sessionStartedAt: bookings.sessionStartedAt,
      sessionEndedAt: bookings.sessionEndedAt,
      serviceDurationMin: services.durationMin,
    })
    .from(bookings)
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, params.bookingId))
    .limit(1);

  if (!booking || booking.providerId !== provider.id) {
    return { ok: false, error: 'Richiesta non trovata.' };
  }

  if (!canTransition(booking.status as BookingStatus, 'completed')) {
    return { ok: false, error: 'La sessione non può essere completata.' };
  }

  const now = new Date();
  // Ensure the session always has a start/end on record. If a video call was
  // tracked, those real times are kept; otherwise we derive a plausible span
  // from the scheduled time + booked duration (default 50') so the history can
  // always show "iniziata … terminata …".
  const durationMs = (booking.serviceDurationMin ?? 50) * 60_000;
  // A scheduled time in the future can't be the real start (the coach is
  // completing it early) — falling back to it would put the start after the
  // end and feed a *negative* span into `getCoachExperienceStats`.
  const plannedStart =
    booking.scheduledFor && booking.scheduledFor.getTime() < now.getTime()
      ? booking.scheduledFor
      : new Date(now.getTime() - durationMs);
  const start = booking.sessionStartedAt ?? plannedStart;
  const end =
    booking.sessionEndedAt ??
    new Date(Math.min(now.getTime(), start.getTime() + durationMs));
  // Last resort: a tracked heartbeat pair can still be inconsistent (clock
  // skew, an end recorded before the start). Never persist a non-positive span.
  const safeEnd =
    end.getTime() > start.getTime() ? end : new Date(start.getTime() + durationMs);

  await db
    .update(bookings)
    .set({
      status: 'completed',
      completedAt: now,
      sessionStartedAt: start,
      sessionEndedAt: safeEnd,
      updatedAt: now,
      updatedBy: params.coachUserId,
    })
    .where(eq(bookings.id, params.bookingId));

  await notify('booking_completed', booking.clientId, { bookingId: booking.id });

  return { ok: true };
}

/**
 * Either participant (the athlete client or the coach) cancels a booking that
 * is still `requested` or `accepted`. Participation + transition enforced.
 */
export async function cancelBooking(params: {
  bookingId: number;
  userId: number;
}): Promise<Result> {
  const [row] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      scheduledFor: bookings.scheduledFor,
      clientId: bookings.clientId,
      coachUserId: providerProfiles.userId,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
    .where(eq(bookings.id, params.bookingId))
    .limit(1);

  if (!row || (params.userId !== row.clientId && params.userId !== row.coachUserId)) {
    return { ok: false, error: 'Prenotazione non trovata.' };
  }

  if (!canTransition(row.status as BookingStatus, 'cancelled')) {
    return { ok: false, error: 'La prenotazione non può essere annullata.' };
  }

  // A session that has already taken place can no longer be cancelled.
  if (!isSessionJoinable(row.scheduledFor)) {
    return {
      ok: false,
      error: 'La sessione è già trascorsa e non può essere annullata.',
    };
  }

  await db
    .update(bookings)
    .set({ status: 'cancelled', updatedAt: new Date(), updatedBy: params.userId })
    .where(eq(bookings.id, params.bookingId));

  // Notify the other participant.
  const recipientId =
    params.userId === row.clientId ? row.coachUserId : row.clientId;
  await notify('booking_cancelled', recipientId, {
    audience: recipientId === row.coachUserId ? 'coach' : 'athlete',
    bookingId: row.id,
  });

  return { ok: true };
}

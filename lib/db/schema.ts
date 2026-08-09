import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  unique,
  uniqueIndex,
  index,
  jsonb,
  check,
  date,
  uuid,
  real,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Audit columns, present on every table (migration 0011). `created_by` /
 * `updated_by` reference `users.id` logically (no DB-level FK to keep system
 * writes and seeds simple); `updated_at` is bumped automatically by the
 * `set_updated_at()` trigger installed on all tables.
 */
const audit = {
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
};

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  // Supabase Auth identity (auth.users.id). Identities live in Supabase Auth;
  // this table remains the app-level profile keyed by integer id.
  // Database FK to auth.users(id) is installed by migration 0020. Kept as a
  // plain UUID here because Drizzle must not try to manage Supabase's auth schema.
  authId: uuid('auth_id').notNull().unique(),
  name: varchar('name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  // Legacy bcrypt hash (pre-Supabase-Auth). Kept for the one-time migration;
  // null for accounts created after the switch.
  passwordHash: text('password_hash'),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  // Optional marketing consent (never required to register). Stored with its
  // timestamp; the required legal acceptances live in `agreement_acceptances`.
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  marketingConsentAt: timestamp('marketing_consent_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
  ...audit,
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
  ...audit,
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .references(() => users.id, { onDelete: 'set null' }),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}

// ---------------------------------------------------------------------------
// Marketplace (Phase 1) — additive tables only.
// `teams` is preserved physically and re-exported below as `organizations`.
// ---------------------------------------------------------------------------

/**
 * Drizzle alias over `teams`. Phase 1 application code imports
 * `organizations`; the physical table name `teams` is preserved (no rename).
 */
export const organizations = teams;

// Common, vertical-agnostic profile fields. One row per user.
export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 120 }),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  locale: varchar('locale', { length: 8 }).notNull().default('it'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

// Catalog of role keys. Seeded; not user-editable.
export const roles = pgTable('roles', {
  key: varchar('key', { length: 40 }).primaryKey(),
  label: varchar('label', { length: 80 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

// Many-to-many: which roles a user holds.
export const userRoles = pgTable(
  'user_roles',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleKey: varchar('role_key', { length: 40 })
      .notNull()
      .references(() => roles.key),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [unique('user_roles_user_id_role_key_unique').on(table.userId, table.roleKey)]
);

// ---------------------------------------------------------------------------
// Taxonomy master data (anagrafiche). Sports and specialties are managed in
// the DB with an `active` flag: only active rows are offered in filters and
// editors; existing profiles keep referencing keys even if later deactivated
// (labels still resolve). Levels ("lavora con") stay in the vertical config.
// ---------------------------------------------------------------------------

export const sports = pgTable('sports', {
  key: varchar('key', { length: 60 }).primaryKey(),
  label: varchar('label', { length: 120 }).notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

export const specialties = pgTable('specialties', {
  key: varchar('key', { length: 60 }).primaryKey(),
  label: varchar('label', { length: 120 }).notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

// Coach side. One row per user that holds the `coach` role.
export const providerProfiles = pgTable('provider_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 120 }).unique(),
  headline: varchar('headline', { length: 160 }),
  description: text('description'),
  specialties: text('specialties').array(),
  categories: text('categories').array(),
  hourlyRate: integer('hourly_rate'),
  currency: varchar('currency', { length: 8 }).notNull().default('EUR'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  // Whether the coach is certified by the KaiPai Academy.
  isKaipaiCertified: boolean('is_kaipai_certified').notNull().default(false),
  // Trust/credibility fields for the public profile (Phase 2 profile redesign).
  videoUrl: text('video_url'),
  yearsExperience: integer('years_experience'),
  // Date the coach started practising. Years of experience are derived from
  // this; `yearsExperience` above is kept in sync on save for backward compat.
  coachSince: date('coach_since'),
  languages: text('languages').array(),
  certifications: text('certifications').array(),
  athleteLevels: text('athlete_levels').array(),
  // Admin-managed verification (meaningful, scarce trust signals).
  identityVerified: boolean('identity_verified').notNull().default(false),
  certificationsVerified: boolean('certifications_verified')
    .notNull()
    .default(false),
  reviewedBy: integer('reviewed_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  submittedAt: timestamp('submitted_at'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

// Athlete side. One row per user that holds the `athlete` role.
export const clientProfiles = pgTable('client_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  category: varchar('category', { length: 60 }),
  level: varchar('level', { length: 40 }),
  goals: text('goals'),
  city: varchar('city', { length: 120 }),
  birthDate: date('birth_date'),
  orgId: integer('org_id').references(() => teams.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

// Offerings created by a provider.
export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id')
    .notNull()
    .references(() => providerProfiles.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 160 }),
  description: text('description'),
  // Coach-owned planned duration. Existing missing values are backfilled to
  // the platform default by migration 0021.
  durationMin: integer('duration_min').notNull().default(40),
  price: integer('price'),
  currency: varchar('currency', { length: 8 }).notNull().default('EUR'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

// A booking request and its lifecycle. No payment fields in Phase 1.
export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: integer('provider_id')
      .notNull()
      .references(() => providerProfiles.id, { onDelete: 'cascade' }),
    serviceId: integer('service_id').references(() => services.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', { length: 20 }).notNull().default('requested'),
    note: text('note'),
    // Athlete's preferred date/time for the session (nullable: a generic
    // request without a specific time is still allowed).
    scheduledFor: timestamp('scheduled_for'),
    // Actual length agreed for THIS session, overriding the service default.
    // Nullable: bookings created before the coach could choose a duration (and
    // athlete-initiated requests) still inherit the service's duration.
    durationMin: integer('duration_min'),
    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    decidedAt: timestamp('decided_at'),
    completedAt: timestamp('completed_at'),
    // Actual video-call span, tracked by a client heartbeat while connected.
    sessionStartedAt: timestamp('session_started_at'),
    sessionEndedAt: timestamp('session_ended_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    index('bookings_provider_id_status_idx').on(table.providerId, table.status),
    index('bookings_client_id_status_idx').on(table.clientId, table.status),
  ]
);

// Privacy-minimised technical events for LiveKit sessions. Raw participant
// identities, display names, media content and access tokens are never stored.
export const videoSessionEvents = pgTable(
  'video_session_events',
  {
    id: serial('id').primaryKey(),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    webhookId: varchar('webhook_id', { length: 80 }).unique(),
    source: varchar('source', { length: 20 }).notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    roomName: varchar('room_name', { length: 160 }).notNull(),
    roomSid: varchar('room_sid', { length: 80 }),
    participantRef: varchar('participant_ref', { length: 64 }),
    participantKind: varchar('participant_kind', { length: 24 }),
    participantSid: varchar('participant_sid', { length: 80 }),
    trackKind: varchar('track_kind', { length: 24 }),
    trackSource: varchar('track_source', { length: 40 }),
    details: jsonb('details')
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    occurredAt: timestamp('occurred_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    index('video_session_events_booking_occurred_idx').on(
      table.bookingId,
      table.occurredAt
    ),
    index('video_session_events_event_occurred_idx').on(
      table.eventType,
      table.occurredAt
    ),
  ]
);

// Weekly recurring availability slots a coach offers. Phase 2 foundation —
// not yet integrated with Cal.com. `weekday` is 0=Sunday … 6=Saturday (matches
// JS `Date.getDay()`); `start_minute`/`end_minute` are minutes from midnight.
// Reusable per-user feature access. A single row changes state over time so
// future plans, add-ons and trials do not leak into feature-specific code.
export const FEATURE_ENTITLEMENT_STATUSES = [
  'enabled',
  'disabled',
  'trial',
  'expired',
  'suspended',
] as const;
export type FeatureEntitlementStatus =
  (typeof FEATURE_ENTITLEMENT_STATUSES)[number];

export const FEATURE_ENTITLEMENT_SOURCES = [
  'admin',
  'beta',
  'subscription',
  'addon',
  'trial',
  'system',
] as const;
export type FeatureEntitlementSource =
  (typeof FEATURE_ENTITLEMENT_SOURCES)[number];

export const userFeatureEntitlements = pgTable(
  'user_feature_entitlements',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    featureCode: varchar('feature_code', { length: 80 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('enabled'),
    source: varchar('source', { length: 20 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    usageLimit: integer('usage_limit'),
    usageCount: integer('usage_count').notNull().default(0),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    unique('user_feature_entitlements_user_feature_unique').on(
      table.userId,
      table.featureCode
    ),
    index('user_feature_entitlements_feature_status_idx').on(
      table.featureCode,
      table.status
    ),
    check(
      'user_feature_entitlements_status_check',
      sql`${table.status} in ('enabled', 'disabled', 'trial', 'expired', 'suspended')`
    ),
    check(
      'user_feature_entitlements_source_check',
      sql`${table.source} in ('admin', 'beta', 'subscription', 'addon', 'trial', 'system')`
    ),
    check(
      'user_feature_entitlements_usage_check',
      sql`${table.usageCount} >= 0 and (${table.usageLimit} is null or ${table.usageLimit} >= 0)`
    ),
    check(
      'user_feature_entitlements_window_check',
      sql`${table.expiresAt} is null or ${table.startsAt} is null or ${table.expiresAt} > ${table.startsAt}`
    ),
  ]
);

export const AI_SESSION_NOTE_STATUSES = [
  'waiting_for_consent',
  'active',
  'processing',
  'ready_for_review',
  'approved',
  'shared',
  'consent_rejected',
  'cancelled',
  'transcription_failed',
  'report_failed',
] as const;
export type AiSessionNoteStatus =
  (typeof AI_SESSION_NOTE_STATUSES)[number];

export const sessionAiNotes = pgTable(
  'session_ai_notes',
  {
    id: serial('id').primaryKey(),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    livekitRoomName: varchar('livekit_room_name', { length: 160 }).notNull(),
    requestedBy: integer('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 })
      .notNull()
      .default('waiting_for_consent'),
    featureCode: varchar('feature_code', { length: 80 })
      .notNull()
      .default('AI_SESSION_NOTES'),
    consentRequired: boolean('consent_required').notNull().default(true),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    processingStartedAt: timestamp('processing_started_at', {
      withTimezone: true,
    }),
    processingCompletedAt: timestamp('processing_completed_at', {
      withTimezone: true,
    }),
    errorCode: varchar('error_code', { length: 80 }),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('session_ai_notes_one_open_per_booking_idx')
      .on(table.bookingId)
      .where(
        sql`${table.status} in ('waiting_for_consent', 'active', 'processing', 'ready_for_review', 'approved')`
      ),
    index('session_ai_notes_booking_created_idx').on(
      table.bookingId,
      table.createdDate
    ),
    check(
      'session_ai_notes_status_check',
      sql`${table.status} in ('waiting_for_consent', 'active', 'processing', 'ready_for_review', 'approved', 'shared', 'consent_rejected', 'cancelled', 'transcription_failed', 'report_failed')`
    ),
    check(
      'session_ai_notes_feature_check',
      sql`${table.featureCode} = 'AI_SESSION_NOTES'`
    ),
    check(
      'session_ai_notes_room_matches_booking_check',
      sql`${table.livekitRoomName} = 'booking-' || ${table.bookingId}::text`
    ),
  ]
);

export const AI_CONSENT_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'revoked',
] as const;
export type AiConsentStatus = (typeof AI_CONSENT_STATUSES)[number];

export const sessionAiConsents = pgTable(
  'session_ai_consents',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id')
      .notNull()
      .references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    participantRole: varchar('participant_role', { length: 24 }).notNull(),
    consentStatus: varchar('consent_status', { length: 20 })
      .notNull()
      .default('pending'),
    consentVersion: varchar('consent_version', { length: 32 }).notNull(),
    consentTextHash: varchar('consent_text_hash', { length: 64 }).notNull(),
    consentedAt: timestamp('consented_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipMetadata: jsonb('ip_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    userAgentMetadata: jsonb('user_agent_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    unique('session_ai_consents_session_user_unique').on(
      table.sessionAiNotesId,
      table.userId
    ),
    index('session_ai_consents_user_status_idx').on(
      table.userId,
      table.consentStatus
    ),
    check(
      'session_ai_consents_role_check',
      sql`${table.participantRole} in ('coach', 'athlete')`
    ),
    check(
      'session_ai_consents_status_check',
      sql`${table.consentStatus} in ('pending', 'accepted', 'rejected', 'revoked')`
    ),
  ]
);

export const AUDIO_RECORDING_STATUSES = [
  'pending',
  'starting',
  'recording',
  'stopping',
  'recorded',
  'failed',
  'deletion_pending',
  'deleted',
  'deletion_failed',
] as const;
export type AudioRecordingStatus =
  (typeof AUDIO_RECORDING_STATUSES)[number];

export const PARTICIPANT_RECORDING_STATUSES = [
  'pending',
  'recording',
  'recorded',
  'failed',
  'deleted',
] as const;
export type ParticipantRecordingStatus =
  (typeof PARTICIPANT_RECORDING_STATUSES)[number];

/**
 * Logical recording for one app participant. It groups the physical Track
 * Egress segments created when a microphone is republished or reconnected;
 * Phase 2B deliberately does not merge those audio files.
 */
export const sessionParticipantRecordings = pgTable(
  'session_participant_recordings',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id')
      .notNull()
      .references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    participantUserId: integer('participant_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    participantRole: varchar('participant_role', { length: 24 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    aggregateStartedAt: timestamp('aggregate_started_at', {
      withTimezone: true,
    }),
    aggregateEndedAt: timestamp('aggregate_ended_at', {
      withTimezone: true,
    }),
    aggregateDurationSeconds: integer('aggregate_duration_seconds')
      .notNull()
      .default(0),
    segmentCount: integer('segment_count').notNull().default(0),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    unique('session_participant_recordings_session_user_unique').on(
      table.sessionAiNotesId,
      table.participantUserId
    ),
    index('session_participant_recordings_session_status_idx').on(
      table.sessionAiNotesId,
      table.status
    ),
    check(
      'session_participant_recordings_role_check',
      sql`${table.participantRole} in ('coach', 'athlete')`
    ),
    check(
      'session_participant_recordings_status_check',
      sql`${table.status} in ('pending', 'recording', 'recorded', 'failed', 'deleted')`
    ),
    check(
      'session_participant_recordings_aggregate_check',
      sql`${table.aggregateDurationSeconds} >= 0 and ${table.segmentCount} >= 0`
    ),
  ]
);

/**
 * One row per authorized LiveKit microphone Track SID. Recording state stays
 * separate from the consent/session lifecycle so partial track failures are
 * visible and a republished microphone receives its own deterministic row.
 */
export const sessionAudioRecordings = pgTable(
  'session_audio_recordings',
  {
    id: serial('id').primaryKey(),
    participantRecordingId: integer('participant_recording_id').references(
      () => sessionParticipantRecordings.id,
      { onDelete: 'cascade' }
    ),
    /**
     * Progressivo dei segmenti dello stesso partecipante, assegnato dal
     * trigger `attach_audio_segment_to_participant_recording`. Una
     * registrazione ripresa dopo un'interruzione è un segmento in più, non
     * una registrazione nuova.
     */
    segmentOrder: integer('segment_order').notNull().default(0),
    sessionAiNotesId: integer('session_ai_notes_id')
      .notNull()
      .references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    participantUserId: integer('participant_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    participantRole: varchar('participant_role', { length: 24 }).notNull(),
    livekitRoomName: varchar('livekit_room_name', { length: 160 }).notNull(),
    livekitParticipantIdentity: varchar('livekit_participant_identity', {
      length: 160,
    }).notNull(),
    livekitTrackSid: varchar('livekit_track_sid', { length: 160 }).notNull(),
    livekitEgressId: varchar('livekit_egress_id', { length: 160 }).unique(),
    provider: varchar('provider', { length: 40 })
      .notNull()
      .default('livekit'),
    status: varchar('status', { length: 32 })
      .notNull()
      .default('pending'),
    storageProvider: varchar('storage_provider', { length: 40 })
      .notNull()
      .default('supabase_s3'),
    storageBucket: varchar('storage_bucket', { length: 100 }).notNull(),
    storageObjectKey: varchar('storage_object_key', {
      length: 500,
    }).notNull(),
    mimeType: varchar('mime_type', { length: 100 })
      .notNull()
      .default('audio/ogg'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    sizeBytes: integer('size_bytes'),
    checksum: varchar('checksum', { length: 160 }),
    errorCode: varchar('error_code', { length: 80 }),
    errorMessageSanitized: varchar('error_message_sanitized', {
      length: 500,
    }),
    retentionUntil: timestamp('retention_until', {
      withTimezone: true,
    }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    lastWebhookEventId: varchar('last_webhook_event_id', { length: 160 }),
    lastReconciledAt: timestamp('last_reconciled_at', {
      withTimezone: true,
    }),
    deletionAttempts: integer('deletion_attempts').notNull().default(0),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    unique('session_audio_recordings_session_track_segment_unique').on(
      table.sessionAiNotesId,
      table.livekitTrackSid,
      table.segmentOrder
    ),
    unique('session_audio_recordings_storage_object_unique').on(
      table.storageBucket,
      table.storageObjectKey
    ),
    index('session_audio_recordings_session_status_idx').on(
      table.sessionAiNotesId,
      table.status
    ),
    index('session_audio_recordings_retention_status_idx').on(
      table.retentionUntil,
      table.status
    ),
    unique('session_audio_recordings_participant_segment_order_unique').on(
      table.participantRecordingId,
      table.segmentOrder
    ),
    check(
      'session_audio_recordings_role_check',
      sql`${table.participantRole} in ('coach', 'athlete')`
    ),
    check(
      'session_audio_recordings_status_check',
      sql`${table.status} in ('pending', 'starting', 'recording', 'stopping', 'recorded', 'failed', 'deletion_pending', 'deleted', 'deletion_failed')`
    ),
    check(
      'session_audio_recordings_provider_check',
      sql`${table.provider} = 'livekit' and ${table.storageProvider} = 'supabase_s3'`
    ),
    check(
      'session_audio_recordings_mime_check',
      sql`${table.mimeType} = 'audio/ogg'`
    ),
    check(
      'session_audio_recordings_size_duration_check',
      sql`(${table.durationSeconds} is null or ${table.durationSeconds} >= 0)
        and (${table.sizeBytes} is null or ${table.sizeBytes} >= 0)
        and ${table.deletionAttempts} >= 0`
    ),
    check(
      'session_audio_recordings_room_booking_check',
      sql`${table.livekitRoomName} = 'booking-' || ${table.bookingId}::text`
    ),
    check(
      'session_audio_recordings_identity_user_check',
      sql`${table.livekitParticipantIdentity} = 'user-' || ${table.participantUserId}::text`
    ),
    check(
      'session_audio_recordings_segment_order_check',
      sql`${table.segmentOrder} is null or ${table.segmentOrder} >= 0`
    ),
  ]
);

/**
 * Server-only replay/idempotency ledger. The raw webhook body is deliberately
 * never persisted: only a digest and minimal routing data are retained.
 */
export const livekitWebhookReceipts = pgTable(
  'livekit_webhook_receipts',
  {
    eventId: varchar('event_id', { length: 160 }).primaryKey(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    roomName: varchar('room_name', { length: 160 }),
    eventCreatedAt: timestamp('event_created_at', {
      withTimezone: true,
    }).notNull(),
    payloadDigest: varchar('payload_digest', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 })
      .notNull()
      .default('processing'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    errorCode: varchar('error_code', { length: 80 }),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('livekit_webhook_receipts_created_status_idx').on(
      table.eventCreatedAt,
      table.status
    ),
    check(
      'livekit_webhook_receipts_status_check',
      sql`${table.status} in ('processing', 'processed', 'failed')`
    ),
    check(
      'livekit_webhook_receipts_digest_check',
      sql`length(${table.payloadDigest}) = 64`
    ),
  ]
);

// Future transcript storage. No Phase 1 client or API writes to this table.
export const sessionTranscriptSegments = pgTable(
  'session_transcript_segments',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id')
      .notNull()
      .references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    participantRecordingId: integer('participant_recording_id').references(
      () => sessionParticipantRecordings.id,
      { onDelete: 'set null' }
    ),
    physicalRecordingId: integer('physical_recording_id').references(
      () => sessionAudioRecordings.id,
      { onDelete: 'set null' }
    ),
    participantUserId: integer('participant_user_id').references(
      () => users.id,
      { onDelete: 'set null' }
    ),
    speakerRole: varchar('speaker_role', { length: 24 }).notNull(),
    sequenceNumber: integer('sequence_number').notNull(),
    startedAtMs: integer('started_at_ms').notNull(),
    endedAtMs: integer('ended_at_ms').notNull(),
    text: text('text').notNull(),
    isFinal: boolean('is_final').notNull().default(false),
    confidence: real('confidence'),
    provider: varchar('provider', { length: 80 }),
    providerModel: varchar('provider_model', { length: 80 }),
    providerSegmentId: varchar('provider_segment_id', { length: 160 }),
    normalizationStatus: varchar('normalization_status', { length: 24 })
      .notNull()
      .default('pending'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    unique('session_transcript_segments_participant_sequence_unique').on(
      table.participantRecordingId,
      table.sequenceNumber
    ),
    unique('session_transcript_segments_provider_segment_unique').on(
      table.sessionAiNotesId,
      table.provider,
      table.providerSegmentId
    ),
    index('session_transcript_segments_session_sequence_idx').on(
      table.sessionAiNotesId,
      table.sequenceNumber
    ),
    index('session_transcript_segments_participant_physical_idx').on(
      table.participantRecordingId,
      table.physicalRecordingId,
      table.sequenceNumber
    ),
    check(
      'session_transcript_segments_timing_check',
      sql`${table.sequenceNumber} >= 0 and ${table.startedAtMs} >= 0 and ${table.endedAtMs} >= ${table.startedAtMs}`
    ),
    check(
      'session_transcript_segments_confidence_check',
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`
    ),
    check(
      'session_transcript_segments_normalization_status_check',
      sql`${table.normalizationStatus} in ('pending', 'normalized', 'failed')`
    ),
  ]
);

/** Immutable-provider sources are projected here into a server-only timeline. */
export const sessionTranscriptTimelineSegments = pgTable(
  'session_transcript_timeline_segments',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id').notNull().references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    participantRecordingId: integer('participant_recording_id').notNull().references(() => sessionParticipantRecordings.id, { onDelete: 'cascade' }),
    participantUserId: integer('participant_user_id').references(() => users.id, { onDelete: 'set null' }),
    participantRole: varchar('participant_role', { length: 24 }).notNull(),
    sourceTranscriptSegmentId: integer('source_transcript_segment_id').notNull().references(() => sessionTranscriptSegments.id, { onDelete: 'cascade' }),
    globalSequence: integer('global_sequence').notNull(),
    participantSequence: integer('participant_sequence').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    normalizedText: text('normalized_text').notNull(),
    normalizationFlags: jsonb('normalization_flags').$type<Record<string, boolean>>().notNull().default({}),
    sourceProvider: varchar('source_provider', { length: 80 }),
    sourceModel: varchar('source_model', { length: 80 }),
    createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
    updatedDate: timestamp('updateddate', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    unique('session_transcript_timeline_session_sequence_unique').on(table.sessionAiNotesId, table.globalSequence),
    unique('session_transcript_timeline_source_unique').on(table.sourceTranscriptSegmentId),
    index('session_transcript_timeline_session_chronological_idx').on(table.sessionAiNotesId, table.startMs, table.endMs),
    index('session_transcript_timeline_participant_idx').on(table.participantRecordingId, table.participantSequence),
    check('session_transcript_timeline_role_check', sql`${table.participantRole} in ('coach', 'athlete')`),
    check('session_transcript_timeline_timing_check', sql`${table.globalSequence} >= 0 and ${table.participantSequence} >= 0 and ${table.startMs} >= 0 and ${table.endMs} >= ${table.startMs}`),
  ]
);

export const AI_PROCESSING_JOB_TYPES = [
  'transcription',
  'transcript_normalization',
  'report_generation',
] as const;
export type AiProcessingJobType = (typeof AI_PROCESSING_JOB_TYPES)[number];

export const AI_PROCESSING_JOB_STATUSES = [
  'queued',
  'processing',
  /**
   * Il lavoro è stato consegnato al provider e si attende la sua callback.
   *
   * Non è né in coda né in esecuzione: nessun worker deve riprenderlo, e
   * proprio per questo è fuori dagli stati claimabili. Esiste perché il
   * worker non può restare in attesa della trascrizione dentro
   * un'invocazione con un tetto di sessanta secondi.
   */
  'awaiting_provider',
  'completed',
  'failed',
  'cancelled',
] as const;
export type AiProcessingJobStatus =
  (typeof AI_PROCESSING_JOB_STATUSES)[number];

/** Server-only asynchronous work ledger. No provider credentials are stored. */
export const sessionAiProcessingJobs = pgTable(
  'session_ai_processing_jobs',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id')
      .notNull()
      .references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    participantRecordingId: integer('participant_recording_id').references(
      () => sessionParticipantRecordings.id,
      { onDelete: 'cascade' }
    ),
    jobType: varchar('job_type', { length: 40 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('queued'),
    provider: varchar('provider', { length: 80 }).notNull().default('disabled'),
    providerOperationId: varchar('provider_operation_id', { length: 200 }),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    availableAfter: timestamp('available_after', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 160 }),
    errorCode: varchar('error_code', { length: 80 }),
    errorMessageSanitized: varchar('error_message_sanitized', {
      length: 500,
    }),
    idempotencyKey: varchar('idempotency_key', { length: 200 })
      .notNull()
      .unique(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('session_ai_processing_jobs_claim_idx').on(
      table.status,
      table.availableAfter,
      table.id
    ),
    index('session_ai_processing_jobs_session_status_idx').on(
      table.sessionAiNotesId,
      table.status
    ),
    index('session_ai_processing_jobs_participant_type_idx').on(
      table.participantRecordingId,
      table.jobType
    ),
    check(
      'session_ai_processing_jobs_type_check',
      sql`${table.jobType} in ('transcription', 'transcript_normalization', 'report_generation')`
    ),
    check(
      'session_ai_processing_jobs_status_check',
      sql`${table.status} in ('queued', 'processing', 'awaiting_provider', 'completed', 'failed', 'cancelled')`
    ),
    check(
      'session_ai_processing_jobs_attempts_check',
      sql`${table.attemptCount} >= 0 and ${table.maxAttempts} > 0 and ${table.attemptCount} <= ${table.maxAttempts}`
    ),
  ]
);

export const TRANSCRIPTION_REQUEST_STATUSES = [
  'submitted',
  'received',
  'failed',
] as const;
export type TranscriptionRequestStatus =
  (typeof TRANSCRIPTION_REQUEST_STATUSES)[number];

/**
 * Un invio di un segmento audio al provider Speech-to-Text.
 *
 * Esiste perché invio e risposta sono separati nel tempo: senza un registro,
 * una risposta che non arriva è indistinguibile da una che non è mai stata
 * chiesta, e la trascrizione si perde in silenzio. È anche il punto di
 * serializzazione che rende idempotente la consegna, che il provider ritenta
 * fino a dieci volte.
 */
export const sessionTranscriptionRequests = pgTable(
  'session_transcription_requests',
  {
    id: serial('id').primaryKey(),
    physicalRecordingId: integer('physical_recording_id')
      .notNull()
      .references(() => sessionAudioRecordings.id, { onDelete: 'cascade' }),
    processingJobId: integer('processing_job_id')
      .notNull()
      .references(() => sessionAiProcessingJobs.id, { onDelete: 'cascade' }),
    callbackToken: varchar('callback_token', { length: 64 })
      .notNull()
      .unique(),
    providerRequestId: varchar('provider_request_id', { length: 200 }),
    provider: varchar('provider', { length: 80 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('submitted'),
    attempt: integer('attempt').notNull().default(1),
    submittedAt: timestamp('submitted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    errorCode: varchar('error_code', { length: 80 }),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('session_transcription_requests_stale_idx').on(
      table.status,
      table.submittedAt
    ),
    check(
      'session_transcription_requests_status_check',
      sql`${table.status} in ('submitted', 'received', 'failed')`
    ),
    check(
      'session_transcription_requests_attempt_check',
      sql`${table.attempt} >= 1`
    ),
  ]
);

/**
 * Un segnalibro posato dal coach durante la sessione.
 *
 * Un tocco, zero attenzione sottratta all'atleta. La posizione e' in
 * millisecondi dall'inizio della sessione, cosi' si allinea alla mappa della
 * conversazione e alla trascrizione, che usano la stessa unita'.
 */
export const sessionCoachBookmarks = pgTable(
  'session_coach_bookmarks',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id')
      .notNull()
      .references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    atMs: integer('at_ms').notNull(),
    /** Facoltativa: si puo' aggiungere dopo, a mente fredda. */
    note: varchar('note', { length: 280 }),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('session_coach_bookmarks_session_idx').on(
      table.sessionAiNotesId,
      table.atMs
    ),
    check('session_coach_bookmarks_at_ms_check', sql`${table.atMs} >= 0`),
  ]
);

export const VOICE_NOTE_STATUSES = ['pending','transcribing','ready','failed'] as const;
export type VoiceNoteStatus = (typeof VOICE_NOTE_STATUSES)[number];

/**
 * Una nota vocale del coach, con il proprio ciclo di trascrizione.
 *
 * Non usa la tabella delle richieste audio perche' quella lega ogni riga a
 * un segmento di registrazione, e una nota vocale non lo e'.
 */
export const sessionCoachVoiceNotes = pgTable(
  'session_coach_voice_notes',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id')
      .notNull()
      .references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    storageBucket: varchar('storage_bucket', { length: 100 }).notNull(),
    storageObjectKey: varchar('storage_object_key', { length: 500 }).notNull(),
    durationMs: integer('duration_ms'),
    sizeBytes: integer('size_bytes'),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    transcript: text('transcript'),
    callbackToken: varchar('callback_token', { length: 64 }).unique(),
    providerRequestId: varchar('provider_request_id', { length: 200 }),
    errorCode: varchar('error_code', { length: 80 }),
    createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
    updatedDate: timestamp('updateddate', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('session_coach_voice_notes_session_idx').on(
      table.sessionAiNotesId,
      table.createdDate
    ),
    check(
      'session_coach_voice_notes_status_check',
      sql`${table.status} in ('pending','transcribing','ready','failed')`
    ),
  ]
);

export const AI_REPORT_STATUSES = [
  'pending',
  'generating',
  'ready_for_review',
  'approved',
  'shared',
  'failed',
] as const;
export type AiReportStatus = (typeof AI_REPORT_STATUSES)[number];

export const AI_REPORT_KINDS = ['session_compass_v1'] as const;
export type AiReportKind = (typeof AI_REPORT_KINDS)[number];

// Reports stay server-only. Athlete-facing sharing must later project
// shared_report_json and must never return private_coach_notes.
// Session Compass v1 is versioned per session: report_version grows when a
// draft is regenerated after approval, so an approved report stays immutable.
/**
 * Le linee guida KaiPai per il riepilogo sessione.
 *
 * Il metodo della casa: come si guarda una seduta, che cosa conta, con che
 * tono si scrive. Vivono nel prodotto e non nel codice perché l'academy le
 * farà evolvere, e ogni modifica non deve passare da un deploy.
 *
 * Ogni salvataggio crea una versione nuova invece di sovrascrivere: un report
 * approvato è stato scritto con una certa versione, e fra sei mesi deve
 * restare possibile sapere quale.
 */
export const aiPromptGuidelines = pgTable(
  'ai_prompt_guidelines',
  {
    id: serial('id').primaryKey(),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    unique('ai_prompt_guidelines_version_unique').on(table.version),
    index('ai_prompt_guidelines_version_idx').on(table.version),
  ]
);

export const sessionAiReports = pgTable(
  'session_ai_reports',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id')
      .notNull()
      .references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    reportKind: varchar('report_kind', { length: 40 })
      .notNull()
      .default('session_compass_v1'),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    reportVersion: integer('report_version').notNull().default(1),
    /** SHA-256 della timeline sorgente: guida idempotenza e rigenerazione. */
    sourceFingerprint: varchar('source_fingerprint', { length: 64 }),
    generatedReportJson: jsonb('generated_report_json').$type<
      Record<string, unknown>
    >(),
    coachEditedReportJson: jsonb('coach_edited_report_json').$type<
      Record<string, unknown>
    >(),
    sharedReportJson: jsonb('shared_report_json').$type<
      Record<string, unknown>
    >(),
    privateCoachNotes: text('private_coach_notes'),
    generatedByProvider: varchar('generated_by_provider', { length: 80 }),
    generatedByModel: varchar('generated_by_model', { length: 120 }),
    promptVersion: varchar('prompt_version', { length: 40 }),
    approvedBy: integer('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    unique('session_ai_reports_session_kind_version_unique').on(
      table.sessionAiNotesId,
      table.reportKind,
      table.reportVersion
    ),
    uniqueIndex('session_ai_reports_one_open_draft_idx')
      .on(table.sessionAiNotesId, table.reportKind)
      .where(
        sql`${table.status} in ('pending', 'generating', 'ready_for_review', 'failed')`
      ),
    index('session_ai_reports_session_kind_version_idx').on(
      table.sessionAiNotesId,
      table.reportKind,
      table.reportVersion
    ),
    check(
      'session_ai_reports_status_check',
      sql`${table.status} in ('pending', 'generating', 'ready_for_review', 'approved', 'shared', 'failed')`
    ),
    check(
      'session_ai_reports_kind_check',
      sql`${table.reportKind} in ('session_compass_v1')`
    ),
    check(
      'session_ai_reports_version_check',
      sql`${table.reportVersion} >= 1`
    ),
  ]
);

export const AI_COMMITMENT_OWNERS = ['coach', 'athlete'] as const;
export type AiCommitmentOwner = (typeof AI_COMMITMENT_OWNERS)[number];

export const AI_COMMITMENT_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'skipped',
] as const;
export type AiCommitmentStatus = (typeof AI_COMMITMENT_STATUSES)[number];

/**
 * Impegni operativi nati da un report Session Compass approvato.
 *
 * Vivono fuori dal JSON del report perché hanno un ciclo di vita proprio: il
 * report approvato resta immutabile, mentre stato, scadenza e note evolvono
 * qui. `commitment_key` deriva dall'evidenza transcript e rende la
 * sincronizzazione idempotente fra versioni successive del report.
 */
export const sessionAiCommitments = pgTable(
  'session_ai_commitments',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id')
      .notNull()
      .references(() => sessionAiNotes.id, { onDelete: 'cascade' }),
    sourceReportId: integer('source_report_id')
      .notNull()
      .references(() => sessionAiReports.id, { onDelete: 'cascade' }),
    sourceReportVersion: integer('source_report_version').notNull(),
    athleteUserId: integer('athlete_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    coachUserId: integer('coach_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commitmentKey: varchar('commitment_key', { length: 64 }).notNull(),
    title: text('title').notNull(),
    owner: varchar('owner', { length: 16 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    dueDate: date('due_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Nota facoltativa dell'atleta quando dichiara di non esserci riuscito. */
    athleteNote: text('athlete_note'),
    sourceTranscriptSegmentId: integer('source_transcript_segment_id').references(
      () => sessionTranscriptSegments.id,
      { onDelete: 'set null' }
    ),
    sourceTimestampMs: integer('source_timestamp_ms').notNull(),
    sourceExcerpt: text('source_excerpt').notNull(),
    /** Una modifica umana prevale sempre su una successiva bozza AI. */
    manuallyEdited: boolean('manually_edited').notNull().default(false),
    /** Impegno non più presente in una versione approvata successiva. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    unique('session_ai_commitments_session_key_unique').on(
      table.sessionAiNotesId,
      table.commitmentKey
    ),
    index('session_ai_commitments_athlete_owner_idx').on(
      table.athleteUserId,
      table.owner,
      table.status
    ),
    index('session_ai_commitments_session_idx').on(
      table.sessionAiNotesId,
      table.owner
    ),
    check(
      'session_ai_commitments_owner_check',
      sql`${table.owner} in ('coach', 'athlete')`
    ),
    check(
      'session_ai_commitments_status_check',
      sql`${table.status} in ('pending', 'in_progress', 'completed', 'skipped')`
    ),
    check(
      'session_ai_commitments_completed_check',
      sql`(${table.status} = 'completed') = (${table.completedAt} is not null)`
    ),
    check(
      'session_ai_commitments_timestamp_check',
      sql`${table.sourceTimestampMs} >= 0`
    ),
  ]
);

export const AI_AUDIT_EVENT_TYPES = [
  'feature_requested',
  'consent_accepted',
  'consent_rejected',
  'consent_revoked',
  'session_activated',
  'session_cancelled',
  'entitlement_denied',
  'entitlement_granted',
  'entitlement_trial_started',
  'entitlement_revoked',
  'status_transitioned',
  'recording_start_requested',
  'recording_started',
  'recording_stop_requested',
  'recording_recorded',
  'recording_failed',
  'recording_deletion_requested',
  'recording_deleted',
  'recording_deletion_failed',
  'recording_reconciled',
  'unverified_participant_blocked',
  'participant_recording_grouped',
  'processing_job_queued',
  'processing_job_claimed',
  'processing_job_completed',
  'processing_job_failed',
  'processing_job_cancelled',
  'processing_job_recovered',
  'compass_report_generated',
  'compass_report_regenerated',
  'compass_report_approved',
  'compass_report_failed',
  'compass_note_updated',
  'compass_commitment_updated',
  'commitment_synced',
  'commitment_archived',
  'commitment_updated_by_coach',
  'commitment_updated_by_athlete',
] as const;
export type AiAuditEventType = (typeof AI_AUDIT_EVENT_TYPES)[number];

export const sessionAiAuditEvents = pgTable(
  'session_ai_audit_events',
  {
    id: serial('id').primaryKey(),
    sessionAiNotesId: integer('session_ai_notes_id').references(
      () => sessionAiNotes.id,
      { onDelete: 'cascade' }
    ),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    actorUserId: integer('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    previousStatus: varchar('previous_status', { length: 32 }),
    newStatus: varchar('new_status', { length: 32 }),
    eventMetadata: jsonb('event_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdDate: timestamp('createddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer('createdby').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedDate: timestamp('updateddate', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('session_ai_audit_events_session_created_idx').on(
      table.sessionAiNotesId,
      table.createdDate
    ),
    check(
      'session_ai_audit_events_type_check',
      sql`${table.eventType} in ('feature_requested', 'consent_accepted', 'consent_rejected', 'consent_revoked', 'session_activated', 'session_cancelled', 'entitlement_denied', 'entitlement_granted', 'entitlement_trial_started', 'entitlement_revoked', 'status_transitioned', 'recording_start_requested', 'recording_started', 'recording_stop_requested', 'recording_recorded', 'recording_failed', 'recording_deletion_requested', 'recording_deleted', 'recording_deletion_failed', 'recording_reconciled', 'unverified_participant_blocked', 'participant_recording_grouped', 'processing_job_queued', 'processing_job_claimed', 'processing_job_completed', 'processing_job_failed', 'processing_job_cancelled', 'processing_job_recovered', 'compass_report_generated', 'compass_report_regenerated', 'compass_report_approved', 'compass_report_failed', 'compass_note_updated', 'compass_commitment_updated', 'commitment_synced', 'commitment_archived', 'commitment_updated_by_coach', 'commitment_updated_by_athlete')`
    ),
  ]
);

// Weekly recurring availability slots a coach offers. `weekday` is 0=Sunday
// through 6=Saturday; start/end values are minutes from midnight.
export const coachAvailability = pgTable(
  'coach_availability',
  {
    id: serial('id').primaryKey(),
    providerId: integer('provider_id')
      .notNull()
      .references(() => providerProfiles.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    unique('coach_availability_provider_weekday_start_unique').on(
      table.providerId,
      table.weekday,
      table.startMinute
    ),
  ]
);

// Internal chat messages tied to a booking. Phase 2 foundation — no realtime
// yet (messages are server-rendered). Access is restricted in
// `lib/core/messages` to the booking's participants and accepted bookings.
export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    senderId: integer('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    // Optional private image attachment. The object key is never exposed
    // directly; authenticated participants read it through the chat API.
    attachmentKey: text('attachment_key'),
    attachmentName: varchar('attachment_name', { length: 255 }),
    attachmentMimeType: varchar('attachment_mime_type', { length: 80 }),
    attachmentSize: integer('attachment_size'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    index('messages_booking_id_created_at_idx').on(
      table.bookingId,
      table.createdAt
    ),
  ]
);

// One WhatsApp-style reaction per user and message. Re-selecting the same
// emoji removes it; choosing another emoji replaces the previous reaction.
export const messageReactions = pgTable(
  'message_reactions',
  {
    id: serial('id').primaryKey(),
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: varchar('emoji', { length: 16 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    unique('message_reactions_message_user_unique').on(
      table.messageId,
      table.userId
    ),
    index('message_reactions_message_id_idx').on(table.messageId),
  ]
);

// --- Relations ---

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleKey],
    references: [roles.key],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
}));

export const providerProfilesRelations = relations(
  providerProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [providerProfiles.userId],
      references: [users.id],
    }),
    services: many(services),
    bookings: many(bookings),
    availability: many(coachAvailability),
  })
);

export const coachAvailabilityRelations = relations(
  coachAvailability,
  ({ one }) => ({
    provider: one(providerProfiles, {
      fields: [coachAvailability.providerId],
      references: [providerProfiles.id],
    }),
  })
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  booking: one(bookings, {
    fields: [messages.bookingId],
    references: [bookings.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  reactions: many(messageReactions),
}));

export const messageReactionsRelations = relations(
  messageReactions,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageReactions.messageId],
      references: [messages.id],
    }),
    user: one(users, {
      fields: [messageReactions.userId],
      references: [users.id],
    }),
  })
);

// Generic, framework-level notifications. Vertical-agnostic: `type` is a stable
// key, `title`/`body` are pre-rendered strings, `data` carries arbitrary JSON
// (e.g. a link/bookingId) for the UI. Reusable by any marketplace on this base.
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    data: jsonb('data'),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    index('notifications_user_id_created_at_idx').on(
      table.userId,
      table.createdAt
    ),
    index('notifications_user_id_read_at_idx').on(table.userId, table.readAt),
  ]
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

// Web Push subscriptions (one per browser/device a user has opted in on).
// `endpoint` is unique — the same device re-subscribing upserts the same row.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [index('push_subscriptions_user_id_idx').on(table.userId)]
);

// Parental authorisation for athletes aged 15-17.
//
// Deliberately NOT a fourth role: the guardian has no area of their own and no
// account to manage. They confirm once, from a signed link in an email, and
// that record is what makes the contract valid — a minor cannot conclude one
// themselves (art. 1425 c.c.), even though from 14 they can consent to the
// data processing on their own under Italian law.
//
// One row per athlete: re-inviting a guardian overwrites the pending request
// rather than accumulating rows. `confirmedAt` null means "invited, waiting".
export const athleteGuardians = pgTable(
  'athlete_guardians',
  {
    id: serial('id').primaryKey(),
    // The minor. Unique: an athlete has at most one guardian on record.
    athleteUserId: integer('athlete_user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    guardianName: varchar('guardian_name', { length: 200 }).notNull(),
    guardianEmail: varchar('guardian_email', { length: 255 }).notNull(),
    // Declared relationship: "madre", "padre", "tutore"…
    relationship: varchar('relationship', { length: 60 }),
    // Set when the guardian follows the signed link and confirms. Until then
    // the athlete cannot request or receive a session.
    confirmedAt: timestamp('confirmed_at'),
    // Evidence of who accepted and from where, kept to prove the consent.
    confirmedIp: varchar('confirmed_ip', { length: 64 }),
    // Art. 316 c.c.: parental responsibility is exercised by both parents, so
    // the confirming one declares they act with the other's agreement.
    bothParentsDeclared: boolean('both_parents_declared')
      .notNull()
      .default(false),
    /** Current operational state. The legal evidence itself is append-only. */
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    /** Typed signature captured from the adult who followed the email link. */
    signatureName: varchar('signature_name', { length: 200 }),
    /** joint_agreement | sole_responsibility | legal_guardian */
    authorityBasis: varchar('authority_basis', { length: 32 }),
    /** Separate guardian authorisation required before AI audio may be offered. */
    aiRecordingAuthorized: boolean('ai_recording_authorized')
      .notNull()
      .default(false),
    confirmedUserAgent: text('confirmed_user_agent'),
    /** Points to the immutable agreement_acceptances row in force. */
    activeAcceptanceId: integer('active_acceptance_id'),
    /** SHA-256 of the bearer link delivered only in the confirmation receipt. */
    managementTokenHash: varchar('management_token_hash', { length: 64 }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    index('athlete_guardians_athlete_user_id_idx').on(table.athleteUserId),
    uniqueIndex('athlete_guardians_management_token_hash_unique')
      .on(table.managementTokenHash),
    check(
      'athlete_guardians_status_check',
      sql`${table.status} in ('pending', 'confirmed', 'revoked')`
    ),
    check(
      'athlete_guardians_authority_basis_check',
      sql`${table.authorityBasis} is null or ${table.authorityBasis} in ('joint_agreement', 'sole_responsibility', 'legal_guardian')`
    ),
  ]
);

export type AthleteGuardian = typeof athleteGuardians.$inferSelect;
export type NewAthleteGuardian = typeof athleteGuardians.$inferInsert;

// Proof that a user accepted a legal document, and which version of it.
//
// **Append-only. Never updated, never deleted.** Each acceptance is a new row:
// the history *is* the evidence. Overwriting would destroy the only record
// that a given person agreed to a given text on a given day.
//
// `agreementKey` is deliberately open to more documents than the platform
// terms — the coach agreement design already calls for 'coach' and
// 'guardian-consent' keys, so they share this table rather than each growing
// their own.
export const agreementAcceptances = pgTable(
  'agreement_acceptances',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** User whose use of the service is covered when the signer is external. */
    subjectUserId: integer('subject_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Normalised email of an external signer, such as a parent/guardian. */
    acceptedByEmail: varchar('accepted_by_email', { length: 255 }),
    /** 'platform-terms' (Terms + Privacy + Cookie, at signup) | 'coach' | 'guardian-consent'. */
    agreementKey: varchar('agreement_key', { length: 40 }).notNull(),
    /** Version of the document accepted, e.g. '2026-07-22'. */
    version: varchar('version', { length: 32 }).notNull(),
    /** SHA-256 of the document text at the moment of acceptance. */
    documentHash: varchar('document_hash', { length: 64 }).notNull(),
    /** General acceptance of the document. */
    acceptedTerms: boolean('accepted_terms').notNull().default(true),
    /** Separate approval of onerous clauses (art. 1341 c.c.), where required. */
    acceptedVexatious: boolean('accepted_vexatious').notNull().default(false),
    /** Typed name, where the document is signed rather than ticked. */
    signatureName: varchar('signature_name', { length: 200 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    /** Document-specific declarations, snapshotted with the acceptance. */
    acceptanceMetadata: jsonb('acceptance_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    acceptedAt: timestamp('accepted_at').notNull().defaultNow(),
  },
  (table) => [
    index('agreement_acceptances_user_key_idx').on(
      table.userId,
      table.agreementKey
    ),
    index('agreement_acceptances_subject_key_idx').on(
      table.subjectUserId,
      table.agreementKey
    ),
  ]
);

export type AgreementAcceptance = typeof agreementAcceptances.$inferSelect;
export type NewAgreementAcceptance = typeof agreementAcceptances.$inferInsert;

// One-time, revocable invitations. Only a SHA-256 digest is persisted: a
// database leak cannot be turned into a usable confirmation link.
export const guardianInvitations = pgTable(
  'guardian_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteGuardianId: integer('athlete_guardian_id')
      .notNull()
      .references(() => athleteGuardians.id, { onDelete: 'cascade' }),
    athleteUserId: integer('athlete_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guardianName: varchar('guardian_name', { length: 200 }).notNull(),
    guardianEmail: varchar('guardian_email', { length: 255 }).notNull(),
    relationship: varchar('relationship', { length: 60 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    deliveryStatus: varchar('delivery_status', { length: 24 })
      .notNull()
      .default('pending'),
    deliveryError: text('delivery_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...audit,
  },
  (table) => [
    index('guardian_invitations_athlete_created_idx').on(
      table.athleteUserId,
      table.createdAt
    ),
    index('guardian_invitations_guardian_status_idx').on(
      table.athleteGuardianId,
      table.consumedAt,
      table.invalidatedAt
    ),
    check(
      'guardian_invitations_delivery_status_check',
      sql`${table.deliveryStatus} in ('pending', 'sent', 'failed', 'skipped')`
    ),
  ]
);

export type GuardianInvitationRow = typeof guardianInvitations.$inferSelect;

// Append-only audit trail for authorisation, delivery and revocation. Current
// state lives in athlete_guardians; this table records how it got there.
export const guardianAuthorizationEvents = pgTable(
  'guardian_authorization_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteUserId: integer('athlete_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    athleteGuardianId: integer('athlete_guardian_id').references(
      () => athleteGuardians.id,
      { onDelete: 'set null' }
    ),
    acceptanceId: integer('acceptance_id').references(
      () => agreementAcceptances.id,
      { onDelete: 'set null' }
    ),
    invitationId: uuid('invitation_id').references(() => guardianInvitations.id, {
      onDelete: 'set null',
    }),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    actorType: varchar('actor_type', { length: 24 }).notNull(),
    actorUserId: integer('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    eventMetadata: jsonb('event_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('guardian_authorization_events_guardian_created_idx').on(
      table.athleteGuardianId,
      table.createdAt
    ),
    index('guardian_authorization_events_acceptance_idx').on(table.acceptanceId),
    check(
      'guardian_authorization_events_type_check',
      sql`${table.eventType} in ('invitation_created', 'invitation_sent', 'invitation_failed', 'authorization_confirmed', 'receipt_sent', 'receipt_failed', 'authorization_revoked', 'guardian_notified', 'guardian_notification_failed')`
    ),
    check(
      'guardian_authorization_events_actor_check',
      sql`${table.actorType} in ('athlete', 'guardian', 'admin', 'system')`
    ),
  ]
);

export type GuardianAuthorizationEvent =
  typeof guardianAuthorizationEvents.$inferSelect;

// Per-user, per-type email delivery preference. Generic: one row per
// (user, notification type). A missing row means "default" (email enabled).
// In-app notifications are always on and are not represented here.
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    // Added by migration 0038. The in-app channel is effectively always on for
    // mandatory events; this column exists so the preferences UI can expose the
    // two channels separately without a second table.
    inAppEnabled: boolean('in_app_enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    unique('notification_preferences_user_type_unique').on(
      table.userId,
      table.type
    ),
  ]
);

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.userId],
      references: [users.id],
    }),
  })
);

// --- Email notifications (migration 0038) ----------------------------------

/**
 * Editable email content, keyed by the notification event. Holds ONLY the
 * message-specific parts: the KaiPai shell (logo, colours, header, signature,
 * footer) lives in `lib/core/email/layout.ts` and is never database-driven.
 *
 * Templates are versioned and never mutated in place: publishing new copy
 * inserts `version + 1` and flips `is_active`. A partial unique index enforces
 * at most one active version per `(key, locale)`.
 *
 * `variables` documents the placeholders the copy may use; the authoritative
 * whitelist is the code catalog, so a template can never widen what it may read.
 * `is_mandatory` mirrors the catalog for display purposes only — the catalog
 * decides whether a user can actually opt out.
 */
export const emailTemplates = pgTable(
  'email_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    category: text('category').notNull(),
    subject: text('subject').notNull(),
    // Structured content (migration 0041). The database holds prose; the layout
    // in `lib/core/email/layout.ts` decides how it looks, so a restyling never
    // has to migrate stored content.
    eyebrow: text('eyebrow'),
    title: text('title'),
    outro: text('outro'),
    /** From v2 on: paragraphs separated by a blank line, not markup. */
    htmlBody: text('html_body').notNull(),
    textBody: text('text_body'),
    variables: jsonb('variables').notNull().default(sql`'[]'::jsonb`),
    locale: text('locale').notNull().default('it-IT'),
    isActive: boolean('is_active').notNull().default(true),
    isMandatory: boolean('is_mandatory').notNull().default(false),
    version: integer('version').notNull().default(1),
    // users.id is a serial integer in this project; auth_id (uuid) is only the
    // Supabase Auth link, so authorship points at the app-level user.
    createdBy: integer('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('email_templates_key_locale_version_unique').on(
      table.key,
      table.locale,
      table.version
    ),
    // Only one active version per (key, locale) — see migration 0038 for the
    // `WHERE is_active` clause Drizzle cannot express here.
    uniqueIndex('email_templates_active_key_locale_idx')
      .on(table.key, table.locale)
      .where(sql`${table.isActive}`),
    index('email_templates_key_idx').on(table.key),
  ]
);

/**
 * One row per attempted notification email: the delivery log AND the
 * deduplication ledger.
 *
 * `idempotencyKey` is deterministic over (event, channel, recipient, concrete
 * subject of the event) — never over a time window. Two chat messages produce
 * two in-app notifications, hence two distinct keys, hence two emails. A retry
 * of the same event produces the same key, the insert conflicts, and the send
 * is skipped.
 */
export const notificationEmailDeliveries = pgTable(
  'notification_email_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // notifications.id is `serial`, so this stays integer. Nullable because
    // some transactional emails (invitations, reminders) have no in-app twin.
    notificationId: integer('notification_id').references(
      () => notifications.id,
      { onDelete: 'set null' }
    ),
    recipientUserId: integer('recipient_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    recipientEmail: text('recipient_email').notNull(),
    templateKey: text('template_key').notNull(),
    templateVersion: integer('template_version'),
    idempotencyKey: text('idempotency_key').notNull(),
    providerMessageId: text('provider_message_id'),
    // queued | sent | failed | skipped
    status: text('status').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('notification_email_deliveries_idempotency_key_unique').on(
      table.idempotencyKey
    ),
    index('notification_email_deliveries_recipient_idx').on(
      table.recipientUserId,
      table.createdAt
    ),
    index('notification_email_deliveries_status_idx').on(
      table.status,
      table.createdAt
    ),
  ]
);

export const notificationEmailDeliveriesRelations = relations(
  notificationEmailDeliveries,
  ({ one }) => ({
    notification: one(notifications, {
      fields: [notificationEmailDeliveries.notificationId],
      references: [notifications.id],
    }),
    recipient: one(users, {
      fields: [notificationEmailDeliveries.recipientUserId],
      references: [users.id],
    }),
  })
);

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
export type NotificationEmailDelivery =
  typeof notificationEmailDeliveries.$inferSelect;

// Verified athlete reviews of a coach. A review is tied to a completed booking
// (one per booking) so it cannot be faked. Seeded demo reviews may have a null
// booking_id. Reusable by any vertical.
export const reviews = pgTable(
  'reviews',
  {
    id: serial('id').primaryKey(),
    providerId: integer('provider_id')
      .notNull()
      .references(() => providerProfiles.id, { onDelete: 'cascade' }),
    bookingId: integer('booking_id')
      .references(() => bookings.id, { onDelete: 'cascade' })
      .unique(),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    body: text('body'),
    // Optional public reply from the coach (accountability / responsiveness).
    reply: text('reply'),
    replyAt: timestamp('reply_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    index('reviews_provider_id_created_at_idx').on(
      table.providerId,
      table.createdAt
    ),
    check('reviews_rating_range', sql`${table.rating} between 1 and 5`),
  ]
);

export const reviewsRelations = relations(reviews, ({ one }) => ({
  provider: one(providerProfiles, {
    fields: [reviews.providerId],
    references: [providerProfiles.id],
  }),
  author: one(users, {
    fields: [reviews.authorId],
    references: [users.id],
  }),
}));

// A user's saved (favourite) coaches. Generic & reusable.
export const favorites = pgTable(
  'favorites',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: integer('provider_id')
      .notNull()
      .references(() => providerProfiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    unique('favorites_user_provider_unique').on(
      table.userId,
      table.providerId
    ),
  ]
);

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  provider: one(providerProfiles, {
    fields: [favorites.providerId],
    references: [providerProfiles.id],
  }),
}));

export const clientProfilesRelations = relations(clientProfiles, ({ one }) => ({
  user: one(users, {
    fields: [clientProfiles.userId],
    references: [users.id],
  }),
  organization: one(teams, {
    fields: [clientProfiles.orgId],
    references: [teams.id],
  }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  provider: one(providerProfiles, {
    fields: [services.providerId],
    references: [providerProfiles.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  client: one(users, {
    fields: [bookings.clientId],
    references: [users.id],
  }),
  provider: one(providerProfiles, {
    fields: [bookings.providerId],
    references: [providerProfiles.id],
  }),
  service: one(services, {
    fields: [bookings.serviceId],
    references: [services.id],
  }),
}));

// ---------------------------------------------------------------------------
// "Invita un amico" — referral (Phase 1: attribution only, no rewards yet).
//
// Two tables on purpose. `referral_codes` holds the ONE stable personal code
// per user (reused for every share); `referrals` records each conversion. The
// unique `referred_user_id` is what makes attribution single and idempotent:
// a new user can be attributed to at most one inviter, forever.
//
// Security note: these tables are read/written only server-side through Drizzle
// (the app never queries them from the browser with the anon key), so — like
// every other table here — authorization is enforced in server code, and the
// public code lookup projects only the inviter's first name, never PII. No RLS.
// ---------------------------------------------------------------------------
export const referralCodes = pgTable(
  'referral_codes',
  {
    id: serial('id').primaryKey(),
    // One code per user. Unique so a user can never hold two personal codes.
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Public, non-guessable, does NOT encode the internal user id. Uppercase
    // base32 (no ambiguous chars). Unique across the whole table.
    code: varchar('code', { length: 16 }).notNull().unique(),
    // Lets us disable a code without deleting it (future abuse handling).
    active: boolean('active').notNull().default(true),
    // Best-effort counter of public-page opens (deduped per visitor cookie).
    openCount: integer('open_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [index('referral_codes_code_idx').on(table.code)]
);

export const referrals = pgTable(
  'referrals',
  {
    id: serial('id').primaryKey(),
    codeId: integer('code_id')
      .notNull()
      .references(() => referralCodes.id, { onDelete: 'cascade' }),
    inviterUserId: integer('inviter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Unique: a signed-up user is attributed to exactly one inviter, once.
    referredUserId: integer('referred_user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    index('referrals_inviter_user_id_idx').on(table.inviterUserId),
  ]
);

export type ReferralCode = typeof referralCodes.$inferSelect;
export type NewReferralCode = typeof referralCodes.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;

// ---------------------------------------------------------------------------
// Onboarding state machine. One row per user, created at signup. Server-owned
// and resumable (the wizard reads `step` back, so a refresh or another device
// continues where it left off). `status` is authoritative for routing:
//   not_started | in_progress | guardian_pending | completed
// The value is set only by server code — never writable from the client.
// ---------------------------------------------------------------------------
export const ONBOARDING_STATUSES = [
  'not_started',
  'in_progress',
  'guardian_pending',
  'completed',
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const userOnboarding = pgTable('user_onboarding', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('in_progress'),
  /** Furthest wizard step reached (0-based), for resume. */
  step: integer('step').notNull().default(0),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ...audit,
});

export type UserOnboarding = typeof userOnboarding.$inferSelect;
export type NewUserOnboarding = typeof userOnboarding.$inferInsert;

// --- Types ---

export type Organization = Team;
export type NewOrganization = NewTeam;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type ProviderProfile = typeof providerProfiles.$inferSelect;
export type NewProviderProfile = typeof providerProfiles.$inferInsert;
export type ClientProfile = typeof clientProfiles.$inferSelect;
export type NewClientProfile = typeof clientProfiles.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type VideoSessionEvent = typeof videoSessionEvents.$inferSelect;
export type NewVideoSessionEvent = typeof videoSessionEvents.$inferInsert;
export type UserFeatureEntitlement =
  typeof userFeatureEntitlements.$inferSelect;
export type NewUserFeatureEntitlement =
  typeof userFeatureEntitlements.$inferInsert;
export type SessionAiNote = typeof sessionAiNotes.$inferSelect;
export type NewSessionAiNote = typeof sessionAiNotes.$inferInsert;
export type SessionAiConsent = typeof sessionAiConsents.$inferSelect;
export type NewSessionAiConsent = typeof sessionAiConsents.$inferInsert;
export type SessionAudioRecording =
  typeof sessionAudioRecordings.$inferSelect;
export type NewSessionAudioRecording =
  typeof sessionAudioRecordings.$inferInsert;
export type SessionParticipantRecording =
  typeof sessionParticipantRecordings.$inferSelect;
export type NewSessionParticipantRecording =
  typeof sessionParticipantRecordings.$inferInsert;
export type SessionAiProcessingJob =
  typeof sessionAiProcessingJobs.$inferSelect;
export type NewSessionAiProcessingJob =
  typeof sessionAiProcessingJobs.$inferInsert;
export type LivekitWebhookReceipt =
  typeof livekitWebhookReceipts.$inferSelect;
export type NewLivekitWebhookReceipt =
  typeof livekitWebhookReceipts.$inferInsert;
export type SessionTranscriptSegment =
  typeof sessionTranscriptSegments.$inferSelect;
export type NewSessionTranscriptSegment =
  typeof sessionTranscriptSegments.$inferInsert;
export type SessionAiReport = typeof sessionAiReports.$inferSelect;
export type NewSessionAiReport = typeof sessionAiReports.$inferInsert;
export type SessionAiCommitment = typeof sessionAiCommitments.$inferSelect;
export type NewSessionAiCommitment = typeof sessionAiCommitments.$inferInsert;
export type SessionAiAuditEvent = typeof sessionAiAuditEvents.$inferSelect;
export type NewSessionAiAuditEvent =
  typeof sessionAiAuditEvents.$inferInsert;
export type CoachAvailability = typeof coachAvailability.$inferSelect;
export type NewCoachAvailability = typeof coachAvailability.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference =
  typeof notificationPreferences.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
export type Sport = typeof sports.$inferSelect;
export type NewSport = typeof sports.$inferInsert;
export type Specialty = typeof specialties.$inferSelect;
export type NewSpecialty = typeof specialties.$inferInsert;

export const BOOKING_STATUSES = [
  'requested',
  'accepted',
  'declined',
  'expired',
  'cancelled',
  'completed',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PROVIDER_STATUSES = [
  'draft',
  'pending',
  'approved',
  'rejected',
] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

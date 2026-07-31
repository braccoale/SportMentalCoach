import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  unique,
  index,
  jsonb,
  check,
  date,
  uuid,
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

// Weekly recurring availability slots a coach offers. Phase 2 foundation —
// not yet integrated with Cal.com. `weekday` is 0=Sunday … 6=Saturday (matches
// JS `Date.getDay()`); `start_minute`/`end_minute` are minutes from midnight.
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
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    index('athlete_guardians_athlete_user_id_idx').on(table.athleteUserId),
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
    acceptedAt: timestamp('accepted_at').notNull().defaultNow(),
  },
  (table) => [
    index('agreement_acceptances_user_key_idx').on(
      table.userId,
      table.agreementKey
    ),
  ]
);

export type AgreementAcceptance = typeof agreementAcceptances.$inferSelect;
export type NewAgreementAcceptance = typeof agreementAcceptances.$inferInsert;

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

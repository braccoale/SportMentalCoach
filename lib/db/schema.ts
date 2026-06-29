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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
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
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
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
    .references(() => users.id),
  displayName: varchar('display_name', { length: 120 }),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  locale: varchar('locale', { length: 8 }).notNull().default('it'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Catalog of role keys. Seeded; not user-editable.
export const roles = pgTable('roles', {
  key: varchar('key', { length: 40 }).primaryKey(),
  label: varchar('label', { length: 80 }),
});

// Many-to-many: which roles a user holds.
export const userRoles = pgTable(
  'user_roles',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    roleKey: varchar('role_key', { length: 40 })
      .notNull()
      .references(() => roles.key),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [unique('user_roles_user_id_role_key_unique').on(table.userId, table.roleKey)]
);

// Coach side. One row per user that holds the `coach` role.
export const providerProfiles = pgTable('provider_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  slug: varchar('slug', { length: 120 }).unique(),
  headline: varchar('headline', { length: 160 }),
  description: text('description'),
  specialties: text('specialties').array(),
  categories: text('categories').array(),
  hourlyRate: integer('hourly_rate'),
  currency: varchar('currency', { length: 8 }).notNull().default('EUR'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  // Whether the coach is certified by the Kai Pai Academy.
  isKaipaiCertified: boolean('is_kaipai_certified').notNull().default(false),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Athlete side. One row per user that holds the `athlete` role.
export const clientProfiles = pgTable('client_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  category: varchar('category', { length: 60 }),
  level: varchar('level', { length: 40 }),
  goals: text('goals'),
  orgId: integer('org_id').references(() => teams.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Offerings created by a provider.
export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id')
    .notNull()
    .references(() => providerProfiles.id),
  title: varchar('title', { length: 160 }),
  description: text('description'),
  durationMin: integer('duration_min'),
  price: integer('price'),
  currency: varchar('currency', { length: 8 }).notNull().default('EUR'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// A booking request and its lifecycle. No payment fields in Phase 1.
export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => users.id),
    providerId: integer('provider_id')
      .notNull()
      .references(() => providerProfiles.id),
    serviceId: integer('service_id').references(() => services.id),
    status: varchar('status', { length: 20 }).notNull().default('requested'),
    note: text('note'),
    // Athlete's preferred date/time for the session (nullable: a generic
    // request without a specific time is still allowed).
    scheduledFor: timestamp('scheduled_for'),
    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    decidedAt: timestamp('decided_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
      .references(() => providerProfiles.id),
    weekday: integer('weekday').notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
      .references(() => bookings.id),
    senderId: integer('sender_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('messages_booking_id_created_at_idx').on(
      table.bookingId,
      table.createdAt
    ),
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

export const messagesRelations = relations(messages, ({ one }) => ({
  booking: one(bookings, {
    fields: [messages.bookingId],
    references: [bookings.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
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

export const BOOKING_STATUSES = [
  'requested',
  'accepted',
  'declined',
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

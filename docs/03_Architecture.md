# SportMentalCoach — Architecture

This document describes the Phase 1 architecture: a reusable marketplace
framework (`core`) with SportMentalCoach as the first vertical.

---

## Guiding principles

- **Core is vertical-agnostic.** Core knows about users, roles, profiles,
  providers, clients, services, listings, bookings, organizations, admin.
  It does not know about sports, mental coaching, athletes, or clubs by name.
- **Verticals inject domain.** A vertical supplies taxonomies (sports,
  specialties), copy (labels, role names visible in the UI), and validation
  rules (Zod schemas extending core ones) via a single `verticalConfig`.
- **One vertical at a time, but ready for N.** Phase 1 ships only the SMC
  vertical, but no code path may hardcode SMC concepts.
- **Feature flags for external providers.** Stripe, LiveKit, Cal.com, Resend,
  OpenAI are all behind flags. Default is `off`. Phase 1 has them all off.
- **Additive migrations.** Never drop or rename existing columns in Phase 1.

---

## High-level layering

```
app/                         Next.js routes (UI + server actions + API)
  (login)/                   sign-in, sign-up, role selection
  (marketplace)/             public surface: /coaches, /coaches/[slug]
  (dashboard)/               role-aware authenticated surface
  (admin)/                   admin-only surface
  api/
    stripe/                  EXISTS, gated by BILLING_ENABLED (Phase 1: off)
    bookings/                Phase 1
    coaches/                 Phase 1
    user/, team/             starter endpoints, refactored or gated

lib/
  core/                      vertical-agnostic marketplace primitives
    auth/                    session, role checks, requireRole()
    profiles/                profile + provider/client profile services
    listings/                public listing queries (filters, pagination)
    bookings/                booking state machine + queries
    orgs/                    organizations (clubs) wrapping `teams`
    admin/                   approval queue, audit helpers
    config/                  verticalConfig contract (TS types)
    flags.ts                 BILLING_ENABLED, VIDEO_ENABLED, etc.
  verticals/
    sport-mental-coach/      SMC-specific config, taxonomies, copy
      config.ts              implements core/config.VerticalConfig
      taxonomies.ts          sports[], specialties[], levels[]
      copy.it.ts             Italian labels and microcopy
  auth/                      EXISTING starter auth (session.ts, middleware.ts)
                             — kept; core/auth wraps it
  db/                        Drizzle schema, queries, migrations
  payments/                  EXISTING Stripe glue, gated, untouched in Phase 1
```

### Why a `core/` vs `verticals/` split

- Reuse: future verticals (e.g. legal coaching, tutoring) reuse `core/`
  unchanged.
- Testability: core has no SMC fixtures; verticals can be swapped in tests.
- Discipline: a code review rule of "no vertical names in `core/`" is easy
  to enforce by grep.

---

## `verticalConfig` contract (Phase 1 shape)

A vertical module exports a single object consumed by core at boot:

```ts
type VerticalConfig = {
  id: string;                       // 'sport-mental-coach'
  locale: 'it' | 'en';
  roles: {
    client: { key: 'athlete'; label: string };
    provider: { key: 'coach'; label: string };
    organization: { key: 'club'; label: string };
  };
  taxonomies: {
    categories: TaxonomyItem[];     // e.g. sports
    specialties: TaxonomyItem[];    // e.g. mental coaching focus areas
    levels?: TaxonomyItem[];        // e.g. amateur/pro
  };
  copy: Record<string, string>;     // UI strings
  validation: {
    providerProfile: ZodSchema;     // extends core base schema
    clientProfile: ZodSchema;
    service: ZodSchema;
  };
};
```

Core consumes `verticalConfig` for: label rendering, filter options on
`/coaches`, validation in onboarding, and the role keys stored in `roles`.

---

## Authentication & roles

Phase 1 keeps the starter's JWT-cookie session (`lib/auth/session.ts`,
`jose`). The single `users.role` column is **kept** for backwards
compatibility but becomes deprecated in favor of:

- `roles` — catalog of role keys (`athlete`, `coach`, `club_admin`, `admin`).
- `user_roles` — many-to-many; a user can hold multiple roles.

Helpers in `lib/core/auth`:

- `getSession()` — unchanged.
- `getUserRoles(userId)` — reads `user_roles`.
- `requireRole(role)` — server-side guard for actions and route handlers.
- Middleware extends the existing `middleware.ts` to attach roles to the
  request context.

Onboarding flow:

1. Sign-up captures email + password + **initial role** (Athlete / Coach /
   Club).
2. A `user_roles` row is created.
3. The user is redirected to the role-specific onboarding wizard, which
   creates the corresponding `provider_profiles` / `client_profiles` /
   organization record.

---

## Organizations (Clubs) — repurposing `teams`

The starter's `teams` table is **kept physically** (no rename in Phase 1) and
re-exposed in code as `organizations`:

- `teams` rows now represent clubs in the SMC vertical.
- `team_members` becomes the membership table for club admins and athletes
  attached to a club.
- `teams.stripe*` columns remain but are **only read when `BILLING_ENABLED`**.
- A Drizzle view/alias `organizations` is introduced in `lib/core/orgs/` so
  application code never imports the legacy name.

A physical rename to `organizations` is deferred to Phase 2 with a proper
migration window.

---

## Booking state machine (Phase 1)

```
requested ──accept──▶ accepted ──complete──▶ completed
    │                     │
    │                     └──cancel────────▶ cancelled
    └──decline──▶ declined
    └──cancel ───▶ cancelled
```

- Transitions are enforced in `lib/core/bookings/`, not in the UI.
- Phase 1 has **no payment or video side-effects** on any transition.
- `accepted` is a terminal-ish state for Phase 1 (no calendar yet);
  `completed` is set manually by the coach.

---

## Stripe isolation

Phase 1 default: `BILLING_ENABLED=false`. The app boots and runs locally
without `STRIPE_SECRET_KEY`. Stripe code is preserved for future
reactivation, never deleted.

Implementation:

- `lib/core/flags.ts` exports `BILLING_ENABLED`. It is true when **either**
  `BILLING_ENABLED=true` (server) **or** `NEXT_PUBLIC_BILLING_ENABLED=true`
  (client) is set. Both must be set together in `.env` so server and client
  agree.
- `lib/payments/stripe.ts` no longer instantiates the Stripe client at module
  load. The `stripe` export is a lazy `Proxy` that constructs the real client
  on first property access and throws if `BILLING_ENABLED=false` or
  `STRIPE_SECRET_KEY` is missing. This lets other modules import `stripe`
  safely without crashing the app at boot.
- `app/api/stripe/checkout/route.ts` and `app/api/stripe/webhook/route.ts`
  return `404 Not found` immediately when `BILLING_ENABLED=false`. The
  webhook also reads `STRIPE_WEBHOOK_SECRET` inside the handler instead of
  at module scope.
- `app/(dashboard)/pricing/page.tsx` calls `notFound()` when disabled.
- `app/(dashboard)/layout.tsx` hides the **Pricing** nav link.
- `app/(dashboard)/dashboard/page.tsx` hides the **Manage Subscription**
  card.
- `lib/db/seed.ts` skips `createStripeProducts()` when disabled.
- `teams.stripe*` columns remain in the schema (no migration) and are not
  read in any non-billing code path.

When `BILLING_ENABLED=false`, the runtime makes zero calls to Stripe APIs
and renders zero Stripe UI. To re-enable billing, set both flags to `true`
and provide `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`.

---

## Public vs authenticated surface

- **Public:** `/`, `/coaches`, `/coaches/[slug]`, `/sign-in`, `/sign-up`.
- **Athlete:** `/dashboard`, `/dashboard/bookings`, `/dashboard/profile`.
- **Coach:** `/dashboard`, `/dashboard/requests`, `/dashboard/services`,
  `/dashboard/profile` (+ approval banner until approved).
- **Admin:** `/admin`, `/admin/coaches` (approval queue), `/admin/bookings`,
  `/admin/users`.

Route groups in Next.js (`(marketplace)`, `(dashboard)`, `(admin)`) carry
the role guard at the layout level.

---

## Data flow for the two MVP flows

### Coach onboarding & approval

1. User signs up with role `coach` → `users` + `user_roles` rows.
2. Onboarding wizard creates `provider_profiles` with `status='draft'`.
3. Coach submits profile → `status='pending'`.
4. Admin approves in `/admin/coaches` → `status='approved'`.
5. Listing query in `lib/core/listings/` filters by `status='approved'`.

### Booking request

1. Athlete on `/coaches/[slug]` clicks "Request booking" on a service.
2. Server action validates with the vertical's `service` Zod schema and
   inserts a `bookings` row with `status='requested'`.
3. Coach sees it in `/dashboard/requests`; transitions to `accepted` or
   `declined`.
4. Athlete sees the updated status in `/dashboard/bookings`.

No emails, no payments, no calendar in Phase 1.

---

## Deferred (Phase 2+)

Cal.com availability, Stripe checkout & Connect payouts, LiveKit rooms,
Resend templates, Supabase Realtime chat channels per booking, reviews tied
to `completed` bookings, AI matching pipeline. All slot into the same core
abstractions without requiring vertical changes.

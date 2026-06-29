# SportMentalCoach — Roadmap

This roadmap turns the current Next.js SaaS starter into a reusable two-sided
marketplace framework, with SportMentalCoach (SMC) as the first vertical.

Phase 1 is scoped to ship the MVP defined in `CLAUDE.md` **without payments**.
Stripe code stays in the repo but is fully isolated behind a feature flag.

---

## Phase 1 — Marketplace Foundation (current)

Goal: a working multi-role marketplace where athletes can discover coaches and
request bookings, coaches can manage their profile and incoming requests, and
admins can approve coaches — all without Stripe.

### Workstreams (suggested execution order)

1. **Stripe isolation**
   - Introduce `BILLING_ENABLED` env flag (default `false`).
   - Gate `app/api/stripe/*`, `lib/payments/*`, the `pricing` page, and any
     read of `teams.stripe*` fields behind the flag.
   - Keep all existing Stripe code in tree; no deletions, no schema drops.

2. **Domain model (additive migrations only)**
   - Add `profiles`, `roles`, `user_roles`, `provider_profiles`,
     `client_profiles`, `services`, `bookings`.
   - Repurpose the existing `teams` table as `organizations` (clubs) — keep
     the physical table name `teams` for Phase 1 to avoid a destructive
     rename; expose it through a `organizations` Drizzle alias in code.
   - Reuse `activity_logs` for admin audit.
   - See `04_Database.md` for the full schema.

3. **Core vs vertical code split**
   - Create `lib/core/` for generic marketplace primitives.
   - Create `lib/verticals/sport-mental-coach/` for SMC-specific taxonomies,
     copy, and config.
   - Introduce a `verticalConfig` contract consumed by core.
   - See `03_Architecture.md`.

4. **Multi-role auth & onboarding**
   - Extend sign-up to capture an initial role (Athlete / Coach / Club).
   - `requireRole()` helper and role-aware middleware.
   - Per-role onboarding wizard to complete the relevant profile.

5. **Public marketplace surface**
   - `/coaches` — listing of `approved` providers, filterable by specialty/sport.
   - `/coaches/[slug]` — public coach detail page with services and a
     "Request booking" CTA.

6. **Booking request flow (no payments)**
   - Athlete creates a `bookings` row in `requested` state.
   - Coach sees incoming requests and can `accept` / `decline`.
   - No money, no calendar, no video — just an intent record.

7. **Dashboards**
   - Athlete dashboard: my bookings, my profile.
   - Coach dashboard: incoming requests, my services, profile editor,
     approval-status banner.
   - Admin dashboard (basic): users list, coach approval queue, bookings
     overview.

8. **Documentation**
   - Backfill `05_API.md`, `06_UI.md`, `07_UserFlows.md`, `08_Backlog.md`
     as features land. `CLAUDE.md` requires docs to evolve with features.

### Out of scope for Phase 1

Stripe / Stripe Connect, Cal.com availability, LiveKit video, Resend email,
Supabase Realtime chat, reviews, AI matching, mobile app. All deferred.

### Exit criteria for Phase 1

- A new visitor can sign up as Athlete, Coach, or Club.
- A Coach can complete a profile, create services, and appear in the public
  listing **only after admin approval**.
- An Athlete can browse coaches, open a detail page, and submit a booking
  request.
- A Coach can accept or decline that request from their dashboard.
- An Admin can approve/reject coaches and see all bookings.
- `BILLING_ENABLED=false` results in zero references to Stripe in the UI and
  zero calls to Stripe APIs at runtime.
- `docs/02–04` reflect the shipped system; `docs/05–08` reflect at least the
  Phase 1 surface.

---

## Phase 2 — Transactions & Communication

Enable money and real-time interaction between matched users.

- Re-enable Stripe behind `BILLING_ENABLED=true`; introduce Stripe Connect for
  coach payouts and platform commission.
- Session packages and coach monthly subscription plans.
- Cal.com integration for coach availability and slot booking.
- LiveKit-based video sessions launched from a confirmed booking.
- Resend transactional emails (booking lifecycle, approval, reminders).
- In-app chat via Supabase Realtime, scoped to active bookings.
- Reviews and ratings tied to completed bookings.

## Phase 3 — Intelligence & Scale

Layer AI and B2B on top of a working marketplace.

- AI assistant for athletes (goal setting, pre-session prep).
- Coach–athlete matching based on profile signals and outcomes.
- Session transcription and structured reports.
- Athlete progress dashboards over time.
- Full Sport Club area: bulk seats, athlete rosters, club-level reporting.
- Mobile app (React Native or PWA).

---

## Cross-cutting principles (apply to every phase)

- Additive, migration-based schema changes; no destructive renames without a
  deprecation window.
- Anything sport- or coaching-specific lives only in
  `lib/verticals/sport-mental-coach/`. Core stays vertical-agnostic.
- Feature flags for anything that touches external providers (Stripe,
  LiveKit, Cal.com, Resend, OpenAI).
- TypeScript strict mode; Zod at all trust boundaries.
- Documentation updated in the same change as the feature.

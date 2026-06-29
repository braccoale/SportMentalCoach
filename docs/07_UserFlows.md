# SportMentalCoach — User Flows (Phase 1)

---

## Browse coaches (public, implemented)

```
Visitor → /coaches
        → (optional) pick sport / specialty → Filtra → /coaches?sport=…&specialty=…
        → click "Vedi profilo" → /coaches/[slug]
```

- No authentication required.
- The listing shows only **approved** coaches. Draft / pending / rejected
  provider profiles never appear publicly.
- Filtering is server-side via query params; results are array-contains matches
  on `provider_profiles.categories` (sport) and `.specialties` (specialty).
- The profile page lists the coach's active services and the booking section
  below.

## Booking request (implemented)

```
On /coaches/[slug] booking section:
  not logged in   → "Richiedi sessione" links to /sign-in?redirect=/coaches/[slug]
  logged in, athlete → service (optional) + note (optional) → Richiedi sessione
                       → creates bookings row (status=requested)
                       → redirect /dashboard/athlete?requested=1
  logged in, not athlete → clear message: only athletes can request

Athlete  → /dashboard/athlete  → sees their requests + status badges
Coach    → /dashboard/coach    → sees incoming requests
         → Accetta / Rifiuta   → booking → accepted | declined
```

- Enforcement is server-side in the actions/domain, not just the UI:
  - `requestBooking` (`app/(marketplace)/coaches/[slug]/actions.ts`) redirects
    anonymous users to sign-in and rejects non-athletes.
  - `createBookingRequest` (`lib/core/bookings`) resolves the coach by slug
    (must be `approved`), validates the optional service belongs to that coach,
    and blocks self-booking.
  - `decideBooking` verifies the booking belongs to the acting coach and that it
    is still `requested` before transitioning (state machine in
    `BOOKING_TRANSITIONS`). Accept → `accepted`, decline → `declined`, with
    `decided_at` set.
- No payments, no calendar availability, no video/chat. The `accepted` state is
  terminal for Phase 1 (no `completed` transition wired in the UI yet).

## Admin approval queue (implemented)

```
Admin → /dashboard/admin  (role-guarded by requireRole('admin'))
      → "Coda di revisione": provider profiles in draft / pending
      → Approva → status=approved  → coach now appears on /coaches
        Rifiuta → status=rejected  → coach stays hidden publicly
      → "Profili revisionati": approved / rejected (re-reviewable)
```

- Visibility rule (single source of truth in `lib/core/listings`): `/coaches`
  and `/coaches/[slug]` only ever show `status = 'approved'`. Draft / pending /
  rejected never appear publicly, so approving/rejecting directly controls
  public visibility.
- Each decision records `reviewed_by` (the admin) and `reviewed_at` on
  `provider_profiles` (existing columns — no schema change). Enforcement and
  audit live in `lib/core/admin` + `app/(dashboard)/dashboard/admin/actions.ts`;
  the actions are guarded by `requireRole('admin')` and `revalidatePath` both
  the queue and `/coaches`.
- No payments, chat, video, or calendar in this step.

## Sign up & role routing (implemented earlier)

```
Visitor → /sign-up → choose role (athlete / coach / club)
        → provisioned (profiles + user_roles + role profile)
        → redirected to /dashboard/{role}
```

See `docs/03_Architecture.md` for the auth/onboarding detail.

---

## Deferred flows (later phases)

- **Booking completion**: coach marking an `accepted` booking as `completed`,
  and athlete/coach cancellation.
- Coach onboarding wizard (rich profile capture + a coach-driven "submit for
  review" transition draft→pending), payments, calendar availability,
  messaging, reviews.

---

## Demo data (local/dev only)

`pnpm db:seed` inserts 3 **approved** demo coaches for exercising `/coaches`:

| Name           | slug             | sports                 | specialties                                   |
|----------------|------------------|------------------------|-----------------------------------------------|
| Marco Rossi    | `marco-rossi`    | football, tennis       | performance_anxiety, focus_concentration, …   |
| Giulia Bianchi | `giulia-bianchi` | swimming, athletics    | motivation, goal_setting, resilience          |
| Luca Verdi     | `luca-verdi`     | basketball, volleyball | team_dynamics, confidence                     |
| Sara Neri      | `sara-neri`      | tennis, golf           | focus_concentration, confidence (**pending**) |

Marco/Giulia are Kai Pai Academy certified; Luca is not. **Sara Neri** is
seeded as `pending` to exercise the admin approval queue (hidden on `/coaches`
until approved). Seeding also creates an **admin** account
`admin@kaipai.com` / `admin1234` (role `admin`). Each has a `profiles` row, a
`provider_profiles` row, and 1–2 `services`. Seeding is idempotent (skips by
email). These are demo accounts and should not be seeded into production.

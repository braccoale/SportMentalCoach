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

## Coach availability (Phase 2, implemented)

```
Coach → /dashboard/coach → "Disponibilità settimanale"
      → add slot: giorno + inizio + fine  (HH:MM → minutes)
      → remove slot
Public → /coaches/[slug] shows the approved coach's weekly availability
         (read-only) as guidance for the athlete.
```

- Weekly recurring slots live in `coach_availability` (`lib/core/availability`),
  validated (`end > start`, unique start per weekday) and ownership-scoped.
- Not integrated with Cal.com; no real calendar/booking-conflict logic yet.

## Booking request (implemented)

```
On /coaches/[slug] booking section:
  not logged in   → "Richiedi sessione" links to /sign-in?redirect=/coaches/[slug]
  logged in, athlete → service (optional) + preferred date/time (optional)
                       + note (optional) → Richiedi sessione
                       → creates bookings row (status=requested, scheduled_for set
                         when a date/time was chosen)
                       → redirect /dashboard/athlete?requested=1
  logged in, not athlete → clear message: only athletes can request

Athlete  → /dashboard/athlete  → sees their requests + preferred time + status
Coach    → /dashboard/coach    → sees incoming requests + preferred time
         → Accetta / Rifiuta   → booking → accepted | declined
```

- The preferred date/time (`scheduled_for`) is validated server-side (must be a
  valid, future datetime) and shown on both dashboards. It is a *preference* —
  the coach still accepts/declines; no automatic slot matching in this step.

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

## Guided coach onboarding (implemented)

```
Coach signs up → /dashboard/coach (status=draft)
  Onboarding card "Completa il tuo profilo" (X/4):
    1. Profilo base          → headline + bio
    2. Sport e specializzazioni → ≥1 sport e ≥1 specializzazione
    3. Servizi               → ≥1 servizio (titolo, durata, prezzo)
    4. Invia per la revisione → status draft→pending
  → "Prossimo passo" links (Vai →) to the relevant editor section
  → Submit button enabled ONLY when steps 1–3 are complete
Admin approves → coach public on /coaches
```

- Progress is **derived from existing data** (`lib/core/onboarding`,
  `getCoachOnboarding`) — no new columns. Step completion: headline+description,
  non-empty categories+specialties, ≥1 service, and `status !== 'draft'`.
- **Approval is never bypassed.** Submitting only moves `draft|rejected →
  pending`; the admin queue still sets `approved`. `submitForReviewAction`
  re-checks completeness server-side, so an incomplete profile cannot be
  submitted even by a crafted request.
- The onboarding card shows on `/dashboard/coach` while the profile is not yet
  `approved`; once approved it is hidden (the status banner remains).

## Coach profile editing & submit-for-review (implemented)

```
Coach → /dashboard/coach
      → edit headline / bio / sports / specialties → Salva profilo
        (status unchanged: approved stays approved; draft/pending/rejected stay)
      → manage services (create / edit / delete)
      → if draft or rejected: "Invia per la revisione" → status=pending
Admin → approves → coach becomes public on /coaches
```

- **Edits never bypass approval.** `updateProviderProfileFields` only writes the
  content fields; it does not touch `status`. So a non-approved coach cannot make
  themselves visible by editing — only the admin queue sets `approved`. An
  already-`approved` coach stays approved, so their edits go live immediately
  (no re-review in Phase 1).
- `submitProviderForReview` moves `draft`/`rejected` → `pending`; `approved`/
  `pending` are left as-is.
- Services CRUD (`lib/core/services`) is ownership-checked (each op resolves the
  coach's `provider_profiles.id` from the session user and scopes the query to
  it). Prices are entered in euros, persisted as cents.

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

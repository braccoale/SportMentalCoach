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

## Notifications (Phase 2, implemented — generic foundation)

```
Domain event → lib/core/notifications.notify(type, recipientUserId, ctx)
            → row in `notifications` (best-effort; never breaks the action)
Header bell (every dashboard page): unread badge + dropdown (last 10)
  → click item → marks read + navigates to data.link
  → "Segna tutte come lette"
/dashboard/notifications: full list + per-item / mark-all read
```

- Events wired (auto-generated): `booking_requested` → coach;
  `booking_accepted` / `booking_completed` → athlete; `booking_cancelled` →
  the other participant; `new_message` → the other participant;
  `provider_approved` / `provider_rejected` → coach.
- **Generic & reusable**: `lib/core/notifications` is the framework primitive —
  a content-agnostic `createNotification` + CRUD (`getRecentWithCount`,
  `getNotifications`, `markAsRead`, `markAllAsRead`) used by the bell
  (`/api/notifications`) and page. Default copy lives in one swappable
  `buildContent` map so a new vertical can override it.
- **Security**: `read_at` updates are scoped to the owner (`markAsRead` /
  `markAllAsRead` filter by `user_id`); `/api/notifications` returns only the
  current user's rows. No push.

### Email mirror (Resend — optional)

Every `notify(...)` first writes the in-app notification (the **source of
truth**), then — best-effort — emails the recipient when email is enabled:

- Enabled only when `EMAIL_NOTIFICATIONS_ENABLED=true` **and** `RESEND_API_KEY`
  + `RESEND_FROM_EMAIL` are set (`isEmailEnabled()`, read lazily). Otherwise the
  send is **skipped** and logged; the app runs normally (Resend is never
  required at startup).
- Covers all 7 types (booking_requested / accepted / cancelled / completed,
  new_message, provider_approved / rejected) since they all flow through
  `notify`.
- Transport is `lib/core/email` via the Resend REST API (`fetch`, no SDK). A
  failed email **never breaks the action** (best-effort, fully caught).
- **Clear logs**: `[email] skipped …`, `[email] sent to … "subject"`,
  `[email] failed to … (status)`.
- No push notifications.

## Session lifecycle completion (Phase 2, implemented)

```
Accepted booking:
  Coach   → "Completa"  → status=completed (sets completed_at)
  Coach   → "Annulla"   → status=cancelled
  Athlete → "Annulla"   → status=cancelled
Requested booking:
  Athlete → "Annulla"   → status=cancelled   (coach uses Accetta/Rifiuta)
```

- Transitions are enforced server-side by the state machine
  (`BOOKING_TRANSITIONS` / `canTransition` in `lib/core/bookings`):
  `accepted → completed | cancelled`, `requested → cancelled`; terminal states
  (`declined`, `cancelled`, `completed`) reject further changes.
- **Authorization**: `completeBooking` is coach-only (ownership-checked);
  `cancelBooking` allows either participant (athlete client or the coach).
- **Dashboards** group bookings into *In attesa / Accettate / Storico*
  (athlete) and *Richieste in attesa / Sessioni accettate / Storico* (coach).
  Completed and cancelled bookings appear in **Storico**.
- **Chat & video are shown only for `accepted` bookings** (both the dashboard
  buttons and the page-level guards in `lib/core/messages` / `lib/core/video`),
  so a cancelled or completed booking exposes neither.

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

## Booking chat (Phase 2, implemented)

```
Booking accepted → both dashboards show an "Apri chat →" link
  Athlete → /dashboard/athlete (Accettate)  → Apri chat
  Coach   → /dashboard/coach (Storico, accepted) → Apri chat
→ /dashboard/chat/[bookingId]
  - server-rendered message list (mine right / theirs left)
  - composer: write + Invia  → message stored, page revalidated
  - "Aggiorna la pagina per vedere i nuovi messaggi" (no realtime yet)
```

- **Access is restricted to the two participants** (the booking's athlete and
  the coach behind the provider profile) and **only for `accepted` bookings**.
  Enforced server-side in `lib/core/messages` (`getChat` / `sendMessage`); a
  non-participant or non-accepted booking gets `notFound()` (no info leak).
- Messages are server-rendered initially; the client `ChatPanel` re-fetches from
  the participant-guarded `GET /api/chat/[bookingId]/messages` after each send.

### Realtime (Supabase Broadcast — optional, security-preserving)

When `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, the
chat becomes live:

- Both participants' clients subscribe to a Supabase **Broadcast** channel
  `chat-<bookingId>`. After a successful send, the sender's client emits a
  **content-free** `new-message` signal; the peer's client receives it and
  re-fetches via the guarded API route.
- **Realtime never carries message content** — it is only a nudge. All reads go
  through the server participant check, so a malicious anon subscriber learns
  nothing beyond "a message happened" and cannot read messages. Realtime
  enhances the UI; it does not replace server-side security.
- **Graceful degradation**: with the Supabase vars unset (`isRealtimeConfigured`
  false), the subscription is skipped and chat works exactly as before — live
  for the sender (refetch on send) and via manual refresh for the peer. The
  composer hint reflects which mode is active.
- No payments, no Cal.com, no schema change (no realtime publication needed —
  Broadcast does not read the DB).

## Booking video call (Phase 2, implemented — LiveKit foundation)

```
Booking accepted → both dashboards show "Apri videochiamata →"
→ /dashboard/video/[bookingId]
  - participant + accepted guard (else notFound)
  - if LiveKit configured: server mints a LiveKit token → <LiveKitRoom> connects
  - if NOT configured: clear "Videochiamata non configurata" setup message
```

- **Access**: only the booking's two participants, only for `accepted`
  bookings. The token is minted **server-side** (`lib/core/video`, using
  `livekit-server-sdk`); the browser only receives a short-lived token + the
  public `NEXT_PUBLIC_LIVEKIT_URL`. Room name is `booking-<id>`.
- **Optional / no-startup-requirement**: video is enabled only when
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` are all set
  (checked lazily by `isVideoConfigured()`). With them unset the app runs
  normally and the video page shows a setup message instead of crashing.
- No payments, no Supabase Realtime, no Cal.com. Chat (Step 2) remains available
  independently of video.

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

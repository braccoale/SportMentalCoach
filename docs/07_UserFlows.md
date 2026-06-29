# SportMentalCoach — User Flows (Phase 1)

---

## Browse coaches (public, implemented)

```
Visitor → /coaches
        → (optional) pick sport / specialty → Filtra → /coaches?sport=…&specialty=…
        → click "Vedi profilo" → /coaches/[slug]
        → click "Richiedi sessione"  [placeholder — disabled in Phase 1]
```

- No authentication required.
- The listing shows only **approved** coaches. Draft / pending / rejected
  provider profiles never appear publicly.
- Filtering is server-side via query params; results are array-contains matches
  on `provider_profiles.categories` (sport) and `.specialties` (specialty).
- The profile page lists the coach's active services. The "Richiedi sessione"
  CTA is a disabled placeholder; the booking flow is introduced in a later
  step.

## Sign up & role routing (implemented earlier)

```
Visitor → /sign-up → choose role (athlete / coach / club)
        → provisioned (profiles + user_roles + role profile)
        → redirected to /dashboard/{role}
```

See `docs/03_Architecture.md` for the auth/onboarding detail.

---

## Deferred flows (later phases)

- **Booking request**: athlete on `/coaches/[slug]` → "Richiedi sessione" →
  creates a `bookings` row (`requested`) → coach accepts/declines. Not in this
  step.
- Coach onboarding wizard (rich profile capture before submitting for
  approval), admin approval queue, payments, messaging, reviews.

---

## Demo data (local/dev only)

`pnpm db:seed` inserts 3 **approved** demo coaches for exercising `/coaches`:

| Name           | slug             | sports                 | specialties                                   |
|----------------|------------------|------------------------|-----------------------------------------------|
| Marco Rossi    | `marco-rossi`    | football, tennis       | performance_anxiety, focus_concentration, …   |
| Giulia Bianchi | `giulia-bianchi` | swimming, athletics    | motivation, goal_setting, resilience          |
| Luca Verdi     | `luca-verdi`     | basketball, volleyball | team_dynamics, confidence                     |

Each has a `profiles` row, an approved `provider_profiles` row, and 1–2
`services`. Seeding is idempotent (skips by email). These are demo accounts and
should not be seeded into production.

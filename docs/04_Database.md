# SportMentalCoach — Database (Phase 1)

PostgreSQL on Supabase, accessed via Drizzle ORM. All Phase 1 changes are
**additive**: no columns are dropped, no tables are renamed at the physical
level. Stripe columns on `teams` remain untouched.

---

## Existing tables (kept as-is)

From the starter, unchanged in Phase 1:

- `users` — auth root. `role` column kept for compatibility but deprecated in
  favor of `user_roles`. New code reads roles from `user_roles`.
- `teams` — repurposed in code as **organizations / clubs**. Physical name
  kept to avoid a destructive rename; a Drizzle alias `organizations` is
  introduced. `stripe_customer_id`, `stripe_subscription_id`,
  `stripe_product_id`, `plan_name`, `subscription_status` remain but are
  read only when `BILLING_ENABLED=true` (off in Phase 1).
- `team_members` — membership of users in organizations (clubs).
- `invitations` — kept; used for inviting members into an organization.
- `activity_logs` — kept; reused for admin audit events.

---

## New tables (Phase 1)

All new tables use `serial` ids for consistency with the existing schema,
`timestamp` with `defaultNow()` for `created_at` / `updated_at`, and
explicit foreign keys to `users(id)`.

### `profiles` (1–1 with `users`)

Common, vertical-agnostic profile fields. One row per user.

| column        | type                | notes                            |
|---------------|---------------------|----------------------------------|
| id            | serial PK           |                                  |
| user_id       | integer FK users.id | unique, not null                 |
| display_name  | varchar(120)        |                                  |
| avatar_url    | text                |                                  |
| bio           | text                |                                  |
| locale        | varchar(8)          | default `'it'`                   |
| created_at    | timestamp           | defaultNow()                     |
| updated_at    | timestamp           | defaultNow()                     |

### `roles`

Catalog of role keys. Seeded; not user-editable.

| column | type           | notes                                                  |
|--------|----------------|--------------------------------------------------------|
| key    | varchar(40) PK | seeded: `athlete`, `coach`, `club`, `admin`            |
| label  | varchar(80)    | human label (vertical can override in UI)              |

> Seeded role keys are `athlete`, `coach`, `club`, `admin` (see
> `lib/db/seed.ts`). `club` is used instead of `club_admin` for Phase 1.

### `user_roles` (many-to-many)

| column     | type                      | notes        |
|------------|---------------------------|--------------|
| id         | serial PK                 |              |
| user_id    | integer FK users.id       | not null     |
| role_key   | varchar(40) FK roles.key  | not null     |
| created_at | timestamp                 | defaultNow() |

Unique constraint on `(user_id, role_key)`.

### `provider_profiles` (Coach side)

One row per user that holds the `coach` role.

| column        | type                | notes                                          |
|---------------|---------------------|------------------------------------------------|
| id            | serial PK           |                                                |
| user_id       | integer FK users.id | unique, not null                               |
| slug          | varchar(120)        | unique; used in `/coaches/[slug]`              |
| headline      | varchar(160)        |                                                |
| description   | text                |                                                |
| specialties   | text[]              | taxonomy keys from the vertical                |
| categories    | text[]              | e.g. sports (vertical taxonomy keys)           |
| hourly_rate   | integer             | cents; nullable in Phase 1                     |
| currency      | varchar(8)          | default `'EUR'`                                |
| status        | varchar(20)         | `draft` / `pending` / `approved` / `rejected`; default `'draft'` |
| is_kaipai_certified | boolean        | Kai Pai Academy certification; default `false` (migration `0002`) |
| reviewed_by   | integer FK users.id | admin who last reviewed                        |
| reviewed_at   | timestamp           |                                                |
| created_at    | timestamp           | defaultNow()                                   |
| updated_at    | timestamp           | defaultNow()                                   |

Listings query filters on `status = 'approved'`.

### `client_profiles` (Athlete side)

One row per user that holds the `athlete` role.

| column      | type                | notes                                  |
|-------------|---------------------|----------------------------------------|
| id          | serial PK           |                                        |
| user_id     | integer FK users.id | unique, not null                       |
| category    | varchar(60)         | e.g. sport key from vertical taxonomy  |
| level       | varchar(40)         | e.g. amateur / pro                     |
| goals       | text                |                                        |
| org_id      | integer FK teams.id | optional; club the athlete belongs to  |
| created_at  | timestamp           | defaultNow()                           |
| updated_at  | timestamp           | defaultNow()                           |

### `services`

Offerings created by a provider.

| column        | type                            | notes                                    |
|---------------|---------------------------------|------------------------------------------|
| id            | serial PK                       |                                          |
| provider_id   | integer FK provider_profiles.id | not null                                 |
| title         | varchar(160)                    |                                          |
| description   | text                            |                                          |
| duration_min  | integer                         | minutes                                  |
| price         | integer                         | cents; **informational only in Phase 1** |
| currency      | varchar(8)                      | default `'EUR'`                          |
| is_active     | boolean                         | default `true`                           |
| created_at    | timestamp                       | defaultNow()                             |
| updated_at    | timestamp                       | defaultNow()                             |

### `bookings`

A booking request and its lifecycle. **No payment fields in Phase 1.**

| column         | type                            | notes                                                              |
|----------------|---------------------------------|--------------------------------------------------------------------|
| id             | serial PK                       |                                                                    |
| client_id      | integer FK users.id             | the athlete                                                        |
| provider_id    | integer FK provider_profiles.id | the coach                                                          |
| service_id     | integer FK services.id          | nullable: a generic request without a service is allowed           |
| status         | varchar(20)                     | `requested` / `accepted` / `declined` / `cancelled` / `completed`; default `'requested'`  |
| note           | text                            | athlete's message                                                  |
| scheduled_for  | timestamp                       | athlete's preferred date/time; nullable (migration `0003`)         |
| requested_at   | timestamp                       | defaultNow()                                                       |
| decided_at     | timestamp                       | set on accept/decline                                              |
| completed_at   | timestamp                       |                                                                    |
| created_at     | timestamp                       | defaultNow()                                                       |
| updated_at     | timestamp                       | defaultNow()                                                       |

Indexes: `(provider_id, status)`, `(client_id, status)`.

Transitions allowed (enforced in `lib/core/bookings/`):

- `requested → accepted | declined | cancelled`
- `accepted  → completed | cancelled`
- terminal: `declined`, `cancelled`, `completed`

### `coach_availability` (Phase 2 foundation)

Weekly recurring availability slots a coach offers. Not yet integrated with
Cal.com. Added by migration `0003`.

| column        | type                            | notes                                          |
|---------------|---------------------------------|------------------------------------------------|
| id            | serial PK                       |                                                |
| provider_id   | integer FK provider_profiles.id | not null                                       |
| weekday       | integer                         | `0`=Sunday … `6`=Saturday (JS `getDay()`)      |
| start_minute  | integer                         | minutes from midnight (e.g. `1020` = 17:00)    |
| end_minute    | integer                         | minutes from midnight; must be > start_minute  |
| created_at    | timestamp                       | defaultNow()                                   |
| updated_at    | timestamp                       | defaultNow()                                   |

Unique constraint on `(provider_id, weekday, start_minute)`. Range validation
(`end > start`, `0..1440`) is enforced in `lib/core/availability`.

---

## Aliases & views

- `organizations` — Drizzle alias over `teams`. All Phase 1 application code
  imports `organizations`; the physical table name `teams` is preserved.
- No SQL views in Phase 1.

---

## Migration strategy

- One Drizzle migration per logical change; numbering continues from
  `0000_soft_the_anarchist.sql`.
- Migrations are **additive only**: `CREATE TABLE`, `ADD COLUMN`,
  `CREATE INDEX`. No `DROP`, no `RENAME`.
- Seeding (`lib/db/seed.ts`) populates the `roles` table and a single admin
  user; SMC taxonomies are **not** seeded into the database — they live in
  `lib/verticals/sport-mental-coach/taxonomies.ts` and are referenced by key.

Implemented: all seven Phase 1 tables are introduced by a single
drizzle-kit–generated migration, `0001_uneven_talos.sql` (`pnpm db:generate`
from the schema diff). It contains only `CREATE TABLE`, `ALTER TABLE … ADD
CONSTRAINT`, and `CREATE INDEX` statements — additive and roll-forward only.
The per-table sequence below was the original suggestion; it was consolidated
into one generated migration to match the Drizzle workflow (`schema.ts` is the
source of truth).

Original suggested sequence (superseded):

1. `roles`, `user_roles`, seed role keys.
2. `profiles`.
3. `provider_profiles` + slug unique index.
4. `client_profiles`.
5. `services`.
6. `bookings` + composite indexes.

Role keys are seeded by `lib/db/seed.ts` (not inside the SQL migration).

---

## Deprecation notes (for Phase 2)

- `users.role` will be removed once all reads go through `user_roles`.
- `teams` will be renamed to `organizations` with a proper deprecation
  window, only after Stripe is re-enabled and its column references are
  audited.
- `teams.stripe_*` columns may move into a dedicated `billing_accounts`
  table when Stripe Connect lands.

None of these happen in Phase 1.

---

## Phase 1 tables NOT introduced (intentionally deferred)

- Cal.com calendar integration (the `coach_availability` foundation now exists;
  Cal.com sync is still deferred).
- Payments, payouts, invoices (Stripe Connect in Phase 2).
- Messages / chat channels (Supabase Realtime in Phase 2).
- Reviews and ratings (Phase 2).
- AI artifacts: transcripts, embeddings, match scores (Phase 3).

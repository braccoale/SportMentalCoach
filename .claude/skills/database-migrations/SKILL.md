---
name: database-migrations
description: "Use BEFORE writing, generating or running any database migration, and before any manual SQL against the project database. Triggers: db:generate, db:migrate, db:seed, drizzle-kit, editing lib/db/schema.ts, ALTER TABLE, DROP COLUMN, adding a table or an index, a CHECK constraint, an RLS policy, 'aggiungo una colonna', 'faccio girare la migrazione'. Also use when a query is about to run against production data."
---

# Migrazioni: lo schema è produzione

The one sentence that governs everything here: **there is no staging.**

`.env.local`, Vercel Preview and Vercel Production all point at the same Supabase project. A `db:migrate`, a `db:seed`, or a query pasted into a terminal hits the real accounts, the real bookings, and the transcripts of real therapy sessions. The safety net a normal project has — try it locally, then promote — does not exist, and no amount of care in the SQL replaces it.

So the rule is not "be careful". It is: **prefer a migration that cannot destroy anything, and say out loud what you are about to run before running it.**

## The flow

```
edit lib/db/schema.ts  →  npm run db:generate  →  read the generated SQL  →  npm run db:migrate
```

- `drizzle.config.ts` points at `lib/db/schema.ts` and writes into `lib/db/migrations/`, with `POSTGRES_URL` from the environment.
- `db:generate` writes a numbered file plus an entry in `migrations/meta/_journal.json`. **The journal is the record of what has been applied — never hand-edit it, never renumber a file, never rewrite a migration that has already run.** A migration that reached the database is history; the correction is a new migration.
- Fifty-four migrations exist. Read the neighbours before adding the fifty-fifth: the conventions below are visible in them.

## Additive by default

Look at what the repository actually does: across all migrations there is **one** file containing a destructive `DROP` (`0029_ai-session-notes-phase-1.sql`). That is not an accident, it is the house style.

| Want to | Do this instead |
|---|---|
| rename a column | add the new one, backfill, keep both until nothing reads the old |
| drop a column | stop reading it, ship, drop it in a much later migration |
| change a type | new column + backfill + switch readers |
| tighten a constraint | add it `NOT VALID`, fix the rows, then validate |
| delete rows | write the `SELECT` first and look at the count |

A column left in place costs nothing but a line in the schema. A column dropped on a Tuesday afternoon costs whatever was in it.

## Constraints belong in the database

This schema puts rules where they cannot be bypassed, and new work should keep doing it:

- **`CHECK` for closed sets** — `session_ai_notes_status_check` lists every legal status, so an invented one is rejected by Postgres even if application code goes wrong.
- **Partial unique indexes for "only one at a time"** — `session_ai_notes_one_open_per_booking_idx` is unique on `booking_id` *only* for open statuses, which allows a history of closed sessions while forbidding two live ones.
- **`CHECK` for cross-column truths** — `session_ai_notes_room_matches_booking_check` proves the LiveKit room name derives from the booking id.
- **RLS** — several migrations from `0011` onward define policies and helper functions. When a new table holds athlete data, it needs its policy in the same migration, not later.

A rule enforced only in TypeScript is a rule that holds until the next code path forgets it.

## Writing the SQL file

Generated migrations are edited by hand here, and the house style is a **comment at the top that explains the decision**, not the mechanics. `0053_device-push-tokens.sql` opens by explaining why device tokens are not squeezed into `push_subscriptions` — the shape of Web Push versus FCM/APNs — so that in six months nobody re-merges them.

Write the *why*. The `CREATE TABLE` below already says the what.

## Before running anything

1. **Read the generated SQL.** `db:generate` occasionally produces a drop-and-recreate for a change you thought was additive.
2. **Say what you are about to run**, and on what. The user has no staging to discover it in.
3. For anything destructive or bulk, **run the `SELECT` version first** and report the row count.
4. `db:seed` is not harmless — it writes into the same live database.
5. After migrating, check that the app still typechecks against the schema (`npx tsc --noEmit`).

## Red flags — stop and ask

- "It's only a rename."
- "The column is unused" — verified how?
- "I'll fix the migration file and re-run it."
- "Let me just clean up those rows."
- Any `DELETE`, `DROP` or `UPDATE` without a `WHERE` you have read twice.
- Running anything at all while unsure which database `POSTGRES_URL` points at.

## Related skills

- `supabase` and `supabase-postgres-best-practices` — generic Postgres and Supabase guidance, installed at user level
- `ai-session-notes` — owns the most constrained tables in the schema, and the reason several of them look the way they do

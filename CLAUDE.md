# Claude Instructions - SportMentalCoach

You are helping build SportMentalCoach, a professional two-sided service marketplace for sport mental coaching.

## Product type

Vertical two-sided service marketplace.

## Main users

Roles are seeded rows in `roles`, linked through `user_roles`: `athlete`, `coach`, `club`, `admin`. Athlete and coach are the two sides the product is built around; `club` exists in the data model but has almost no surface yet — do not assume a screen for it exists.

## Tech stack

What is actually installed. Check `package.json` before adding to this list, and never infer an SDK from the name of a service.

- **Next.js 15** (canary) with **React 19**, TypeScript, **Tailwind CSS 4**
- UI primitives in `components/ui/` — shadcn-style components on **Radix**, copied into the repo, not a dependency
- **PostgreSQL on Supabase**, **Drizzle ORM** (`db:generate` / `db:migrate`)
- **Supabase Auth** — users carry an `auth_id` linking to the Supabase user; `auth:migrate` backfills it
- **Supabase Realtime** — Broadcast, for the incoming-call popup (`components/incoming-call-listener.tsx`)
- **LiveKit** — `@livekit/components-react` on the web, `@livekit/react-native` in the app
- **Stripe** — Checkout and Billing Portal for subscriptions, in `lib/payments/`. **Stripe Connect is not implemented**; there is no marketplace payout flow yet.
- **OpenAI** — called over plain `fetch`, model `gpt-5-mini`. The `openai` package is **not** installed.
- **Resend** — called over plain `fetch` from `lib/core/email/`. The `resend` package is **not** installed.
- **Deepgram** — transcription, via `lib/core/ai-session-notes/providers.ts`
- **Cal.com is not used.** The name survives only as a legacy column in `lib/db/schema.ts`. Booking, availability and scheduling are entirely ours, in `lib/core/`.

## Development principles

- Keep the project modular.
- Build reusable marketplace components.
- Prefer clean architecture.
- Avoid hardcoding SportMentalCoach-specific logic when a generic marketplace abstraction is better.
- Always update documentation when adding major features.
- Use TypeScript strictly.
- Keep database schema explicit and migration-based.
- Decisions live in `lib/core/` as pure functions with a `.test.ts` beside them, so they can be verified without a browser, a device, or a network.

## Two things that will cost you if nobody said them

**The development database is production.** `.env.local`, Vercel Preview and Vercel Production all point at the same Supabase project. A `db:migrate`, a `db:seed` or a manual query run locally hits real data. There is no staging to be careless in. Say so before running anything destructive, and prefer an additive migration.

**The `.vercel.app` alias is production.** Pushing a branch creates a Preview at a different URL; it does not update the alias.

## Tests

`npm test` runs the pure-logic suite through `tsx --test` — around seventy files, mostly `lib/core/`, including one mobile module. Scripts named `test:ai-notes:*` reach real infrastructure (RLS, schema, live pipeline) and are not part of the default run; they cost real calls and touch the production project.

When adding a pure module, add it to the `test` script. `npm run test:inventory` reports what exists but is not wired in.

## The three cores

Booking, the live video session, and the AI session notes are the product. Work touching any of them starts by loading its skill — before reading code, and before proposing a solution:

- **Prenotazioni, disponibilità, orari, fusi orari** → `booking-scheduling`
- **Videochiamata, LiveKit, camera, microfono, audio** → `realtime-video-calls`
- **Registrazione, consenso, trascrizione, riepilogo** → `ai-session-notes`
- **Qualcosa che esiste sul web e deve funzionare anche nell'app** → `web-mobile-parity`

These skills exist because each of the three has already produced a defect that no error message reported: an invented booking status that silently hid every athlete request, an appointment time built in the device's timezone, a heartbeat mistaken for a closure. They record what is true in this repository, so the answer is not re-derived — and re-derived wrongly — each time.

## Three more, where a mistake is expensive in a different way

Not cores, but areas where the cost of getting it wrong is not a broken screen:

- **Schema, migrazioni, qualunque SQL contro il database** → `database-migrations`
- **Minori, tutori, consensi, documenti legali** → `guardians-legal`
- **Email in uscita, notifiche, preferenze, promemoria** → `transactional-email`

The first because there is no staging and the database is production. The second because an error there is not a defect but a minor in a session without valid authorisation. The third because the two ways to fail — the mail that never arrives and the mail that arrives twice — are both invisible from the code that triggered them.

**A rule is written once.** Scheduling and authorization decisions live in `lib/core/` and run on the server; clients receive the outcome. When the app needs something the web already does, extend the shared route (it accepts a Bearer token as well as a cookie) rather than writing a mobile twin or copying the rule into `mobile/`.

**Never claim a capability without checking `node_modules`.** Questions about what the video SDK supports are exactly where a confident wrong answer costs the most.

## Mobile development and UX/UI

The mobile app lives in `mobile/` (React Native + Expo) and is a companion to the web app, not a copy of it.

### Which skill to use

`react-native-expo` is the primary technical skill for normal mobile implementation.

For significant mobile UI work, reason in this order:

`mobile-product-designer` → `mobile-ux-ui` → `react-native-expo`

Alongside it:

- `mobile-accessibility` during implementation, not as a later pass;
- `mobile-performance` when performance matters;
- `mobile-testing` when verifying behaviour.

`ios-swiftui` and `android-compose` are only for actual native Swift/Kotlin work. Do not invoke them for ordinary React Native code, even though it runs on iPhone and Android.

For the call screen, load `realtime-video-calls` as well: it records what the installed LiveKit SDK actually supports on each side. The two are not equal, and the difference is the answer to most capability questions: the **web** has `@livekit/track-processors` and `@livekit/krisp-noise-filter`, so background blur and noise filtering work there. On **React Native** neither exists, and Picture-in-Picture does not either. "It works on the web" is not evidence that it works in the app.

### Verification

Never let a clean typecheck imply device behaviour was confirmed. State the level reached: `typecheck/test`, `emulator`, `physical Android`, `physical iOS`. Permissions, camera, microphone, audio routing, push notifications and background behaviour can only be verified by looking at a device.

### Principles

- Briefly reason about the user goal, the primary action, and the information hierarchy before writing a significant screen. State the answers; do not leave them implicit.
- Never port a desktop layout to mobile mechanically. A mobile workflow is redesigned for the device and its context of use — often standing, one-handed, mid-session, on an unreliable connection.
- UX clarity comes before visual decoration. If a screen can be simpler without losing capability, simplify it.
- Prefer native platform conventions over web-like custom components.
- Coach and athlete should not automatically share the same UI. Where their goals differ, the screen differs; where their goals coincide, one screen serves both.
- Every significant UI change accounts for loading, empty, error and success states. An empty state must say why it is empty and what to do next.
- Avoid generic SaaS dashboard design on mobile: stacked cards, cards inside cards, squeezed tables, competing CTAs.
- Keep the app intentionally focused. It exists for the moment of the session; reading, reviewing and planning stay on the web. Not reproducing a web feature is a valid decision — say so rather than building a cramped version.
- Never claim device behaviour was verified when only a typecheck or tests ran.

## Web development

The web app is the larger half of the product — around fifty API routes, fifty components, and the whole of `lib/core/`. It is where reading, reviewing and planning happen, and it is not covered by the mobile skills.

- `vercel-react-best-practices` for React and Next.js work on the web. **It applies to the web only.** The web is React 19; `mobile/` is React 18, where `use`, `useActionState` and the React Compiler do not exist and memoization is manual. Applying the same advice to both sides is a mistake in one of them.
- `frontend-design` for visual craft on the web.
- Colours and typography come from the tokens in `app/globals.css` (dark, red accent). A literal hex in a component is the same defect on the web as in the app.

## Where the project actually stands

The MVP is long done: registration, the three dashboards, coach profiles and listing, booking, and admin all exist and are in production use. Do not treat the product as early-stage, and do not propose a simplification whose real justification is that this is a first version.

Current work is downstream of that, and most of it lives in the AI session notes: the session report, the compass, the mental journey, commitments, coach bookmarks, recording coverage and the retry policy — alongside guardian consent for minors, referrals, legal acceptance hashing, and the transactional email templates.

Two consequences:

- **Prefer extending an existing rule in `lib/core/` to inventing a parallel one.** With 155 modules there, the rule you need usually already exists; a second one that disagrees is the defect pattern this repository has already paid for repeatedly.
- **Prompt changes are product changes.** The provider prompts (`openai-session-report-provider.ts`, `openai-session-compass-provider.ts`, and `house-guidelines.ts`) shape what a coach reads about a real client. A worse prompt throws no exception and fails no test — so a change there is justified in the response and checked against its contract test, never adjusted by feel.
# Claude Instructions - SportMentalCoach

You are helping build SportMentalCoach, a professional two-sided service marketplace for sport mental coaching.

## Product type

Vertical two-sided service marketplace.

## Main users

- Athlete / Client
- Coach
- Sport Club
- Admin

## Tech stack

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- PostgreSQL on Supabase
- Drizzle ORM
- Stripe / Stripe Connect
- LiveKit
- Cal.com
- Resend
- Supabase Realtime
- OpenAI

## Development principles

- Keep the project modular.
- Build reusable marketplace components.
- Prefer clean architecture.
- Avoid hardcoding SportMentalCoach-specific logic when a generic marketplace abstraction is better.
- Always update documentation when adding major features.
- Use TypeScript strictly.
- Keep database schema explicit and migration-based.
- Prioritize MVP features before advanced AI features.

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

## MVP goal

Create the first working version with:

- multi-role registration;
- athlete dashboard;
- coach dashboard;
- coach profile;
- coach listing;
- basic booking request;
- admin dashboard.
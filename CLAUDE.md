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

## MVP goal

Create the first working version with:

- multi-role registration;
- athlete dashboard;
- coach dashboard;
- coach profile;
- coach listing;
- basic booking request;
- admin dashboard.
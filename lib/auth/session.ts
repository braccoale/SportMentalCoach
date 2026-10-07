import { compare, hash } from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Solo per `lib/db/seed.ts`: gli account demo/admin seminati ricevono un
 * `passwordHash` nella colonna omonima, ma **nessun percorso di login reale
 * lo legge più** — l'identità vera è Supabase Auth (`lib/auth/supabase.ts`),
 * non questa tabella. Fino al 2026-09-19 questo file portava anche un
 * meccanismo di sessione JWT/cookie parallelo (`getSession`/`setSession`,
 * cookie `session`), avanzo del Next.js SaaS Starter da cui è nato il
 * progetto: `getSession()` non aveva più nessun chiamante e l'unica chiamata
 * a `setSession()` (in `app/api/stripe/checkout/route.ts`) scriveva un
 * cookie che nulla rileggeva più — una seconda via di autenticazione, morta,
 * accanto a quella vera. Rimossa nell'hardening di produzione; vedi
 * `docs/SECURITY_ARCHITECTURE.md`.
 */
export async function hashPassword(password: string) {
  return hash(password, SALT_ROUNDS);
}

export async function comparePasswords(
  plainTextPassword: string,
  hashedPassword: string
) {
  return compare(plainTextPassword, hashedPassword);
}

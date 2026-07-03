import { isNull, and, eq, isNotNull } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { db, client } from './drizzle';
import { users } from './schema';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

/**
 * One-time (idempotent) migration of legacy accounts to Supabase Auth.
 *
 * For every `public.users` row without an `auth_id`:
 *  - creates the identity in Supabase Auth, importing the existing bcrypt
 *    `password_hash` (users keep their passwords), with the email confirmed;
 *  - links the row via `auth_id`.
 *
 * Safe to re-run (e.g. after `pnpm db:seed`): already-linked rows are
 * skipped, and "email already registered" resolves to a link-only update.
 *
 * Run with: pnpm auth:migrate
 */
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono richieste.'
    );
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pending = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(
      and(
        isNull(users.authId),
        isNull(users.deletedAt),
        isNotNull(users.passwordHash)
      )
    );

  console.log(`Utenti da migrare: ${pending.length}`);
  let ok = 0;
  let failed = 0;

  for (const u of pending) {
    try {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password_hash: u.passwordHash!,
        email_confirm: true,
      });

      let authId = data?.user?.id ?? null;

      if (error) {
        // Already in Supabase Auth (e.g. partial previous run): link by email.
        const msg = error.message.toLowerCase();
        if (msg.includes('already')) {
          const { data: list } = await admin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });
          authId =
            list?.users.find(
              (au) => au.email?.toLowerCase() === u.email.toLowerCase()
            )?.id ?? null;
        }
        if (!authId) throw error;
      }

      await db
        .update(users)
        .set({ authId })
        .where(eq(users.id, u.id));
      ok++;
      console.log(`  ✓ ${u.email}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${u.email}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`\nMigrati: ${ok} · Falliti: ${failed}`);
  await client.end();
}

main();

import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { userRoles } from '@/lib/db/schema';

/**
 * Returns the role keys held by a user (from `user_roles`). Cached per request
 * so `requireRole` + `hasRole` in the same render share one query.
 *
 * Kept separate from `roles.ts` (which imports `next/navigation` for
 * `requireRole`'s redirects): a background job runner invoked with plain
 * Node — `npm run ai-notes:process`, the local recovery path for a stuck
 * AI Notes session — cannot resolve `next/navigation` outside the Next.js
 * app router runtime, and a single `hasRole` import used to drag it in.
 */
export const getUserRoles = cache(async (userId: number): Promise<string[]> => {
  const rows = await db
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleKey);
});

/** True when the user holds the given role key. */
export async function hasRole(userId: number, roleKey: string): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return roles.includes(roleKey);
}

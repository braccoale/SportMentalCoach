import 'server-only';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { userRoles, type User } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import {
  ROLE_PRIORITY,
  ROLE_DASHBOARDS,
  dashboardPathForRoles,
} from './role-routes';

export { ROLE_PRIORITY, ROLE_DASHBOARDS, dashboardPathForRoles };

/** Returns the role keys held by a user (from `user_roles`). */
export async function getUserRoles(userId: number): Promise<string[]> {
  const rows = await db
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleKey);
}

/** True when the user holds the given role key. */
export async function hasRole(userId: number, roleKey: string): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return roles.includes(roleKey);
}

/**
 * Server-side guard for pages, route handlers and actions. Redirects to
 * `/sign-in` when unauthenticated, or to the user's own dashboard when they
 * lack every required role. Returns the authenticated user on success.
 */
export async function requireRole(roleKey: string | string[]): Promise<User> {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const required = Array.isArray(roleKey) ? roleKey : [roleKey];
  const roles = await getUserRoles(user.id);
  const allowed = required.some((r) => roles.includes(r));

  if (!allowed) {
    redirect(dashboardPathForRoles(roles));
  }

  return user;
}

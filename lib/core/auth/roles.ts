import 'server-only';
import { redirect } from 'next/navigation';
import { type User } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import {
  ROLE_PRIORITY,
  PRIMARY_DASHBOARD_ROLES,
  ROLE_DASHBOARDS,
  dashboardPathForRoles,
} from './role-routes';
import { getUserRoles, hasRole } from './role-checks';

export {
  ROLE_PRIORITY,
  PRIMARY_DASHBOARD_ROLES,
  ROLE_DASHBOARDS,
  dashboardPathForRoles,
  getUserRoles,
  hasRole,
};

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

// Pure role → route mapping. No server-only imports, so this is safe to use
// from client components (e.g. dashboard navigation) as well as the server.

/**
 * Role keys that own a dashboard surface, in priority order. When a user holds
 * several roles, the highest-priority one decides the post-login landing page.
 */
export const ROLE_PRIORITY = ['admin', 'coach', 'club', 'athlete'] as const;

/** Maps a role key to its dashboard home. */
export const ROLE_DASHBOARDS: Record<string, string> = {
  admin: '/dashboard/admin',
  coach: '/dashboard/coach',
  club: '/dashboard/club',
  athlete: '/dashboard/athlete',
};

/** Resolves the dashboard path for a set of role keys (priority-ordered). */
export function dashboardPathForRoles(roles: string[]): string {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return ROLE_DASHBOARDS[role];
  }
  return '/dashboard';
}

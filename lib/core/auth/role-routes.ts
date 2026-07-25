// Pure role → route mapping. No server-only imports, so this is safe to use
// from client components (e.g. dashboard navigation) as well as the server.

/**
 * Non-admin dashboard roles that decide the DEFAULT landing, in priority order.
 * Admin is intentionally excluded here: it's a secondary area reached from the
 * menu, never the default landing for a user who also holds a normal role. So a
 * coach-who-is-also-admin lands on the coach dashboard and opens Admin from the
 * menu; a user with only the admin role still lands on the admin area.
 */
export const PRIMARY_DASHBOARD_ROLES = ['coach', 'club', 'athlete'] as const;

/**
 * Full priority list (admin last) — used only when a user has no normal role.
 */
export const ROLE_PRIORITY = [
  ...PRIMARY_DASHBOARD_ROLES,
  'admin',
] as const;

/** Maps a role key to its dashboard home. */
export const ROLE_DASHBOARDS: Record<string, string> = {
  admin: '/dashboard/admin',
  coach: '/dashboard/coach',
  club: '/dashboard/club',
  athlete: '/dashboard/athlete',
};

/**
 * Resolves the default dashboard path for a set of role keys: a normal role
 * first (coach/club/athlete), and the admin area only when admin is the sole
 * role.
 */
export function dashboardPathForRoles(roles: string[]): string {
  for (const role of PRIMARY_DASHBOARD_ROLES) {
    if (roles.includes(role)) return ROLE_DASHBOARDS[role];
  }
  if (roles.includes('admin')) return ROLE_DASHBOARDS.admin;
  return '/dashboard';
}

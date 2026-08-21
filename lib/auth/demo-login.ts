export const DEMO_LOGIN_ACCOUNTS = {
  coach: {
    email: 'coachdemo@kaipaicoaching.com',
    destination: '/dashboard/coach',
  },
  athlete: {
    email: 'atletademo@kaipaicoaching.com',
    destination: '/dashboard/athlete',
  },
} as const;

export type DemoLoginRole = keyof typeof DEMO_LOGIN_ACCOUNTS;

export function parseDemoLoginRole(value: unknown): DemoLoginRole | null {
  return value === 'coach' || value === 'athlete' ? value : null;
}

export function isInteractiveDemoIdentity(
  user: {
    email?: string | null;
    app_metadata?: Record<string, unknown>;
  },
  role: DemoLoginRole
): boolean {
  const expected = DEMO_LOGIN_ACCOUNTS[role];
  return (
    user.email?.toLowerCase() === expected.email &&
    user.app_metadata?.kaipai_demo === true &&
    user.app_metadata?.demo_readonly === true &&
    user.app_metadata?.interactive_demo === true &&
    user.app_metadata?.demo_role === role
  );
}

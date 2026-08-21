import { cache } from 'react';
import { desc, and, eq, isNull } from 'drizzle-orm';
import { db } from './drizzle';
import { activityLogs, profiles, teamMembers, teams, users } from './schema';
import { unstable_rethrow } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServer } from '@/lib/auth/supabase';
import type { SessionUser } from '@/lib/auth/session-user';
import {
  REQUEST_METHOD_HEADER,
  assertDemoWriteAllowed,
} from '@/lib/auth/demo-readonly';

/**
 * Resolves the current user: Supabase Auth session (cookie) → app profile
 * row in `public.users` (by `auth_id`). Returns null when logged out,
 * unknown, or soft-deleted.
 *
 * Wrapped in React `cache()` so repeated calls within a single server request
 * (layout + page + `requireRole`) share one Supabase Auth validation + DB read
 * instead of doing a network round-trip each time.
 */
const getCachedUser = cache(async () => {
  let authUserId: string | null = null;
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    authUserId = authUser?.id ?? null;
  } catch (error) {
    // Next.js internal signals (dynamic rendering, redirects) must propagate.
    unstable_rethrow(error);
    // Missing Supabase env or auth outage: treat as logged out rather than
    // crashing every page render.
    return null;
  }
  if (!authUserId) return null;

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.authId, authUserId), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
});

/**
 * Restituisce l'utente corrente e, durante una mutazione, applica il vincolo
 * readonly degli account demo prima che l'action/route raggiunga il database.
 * `allowDemoMutation` è riservato al logout, che deve restare sempre possibile.
 */
export async function getUser(options?: { allowDemoMutation?: boolean }) {
  const user = await getCachedUser();
  if (!user || !user.isDemo || options?.allowDemoMutation) return user;

  const requestHeaders = await headers();
  const method =
    requestHeaders.get(REQUEST_METHOD_HEADER) ??
    (requestHeaders.has('next-action') ? 'POST' : 'GET');
  assertDemoWriteAllowed(user, method);
  return user;
}

/** Current account plus the profile photo used by authenticated navigation. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const user = await getUser();
  if (!user) return null;

  const [profile] = await db
    .select({ avatarUrl: profiles.avatarUrl })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  return { ...user, avatarUrl: profile?.avatarUrl ?? null };
});

export async function getTeamByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.stripeCustomerId, customerId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(teams)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(teams.id, teamId));
}

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: teamMembers.teamId
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
    with: {
      team: {
        with: {
          teamMembers: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  return result?.team || null;
}

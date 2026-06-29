import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  profiles,
  userRoles,
  clientProfiles,
  providerProfiles,
} from '@/lib/db/schema';

/** Marketplace roles a user can self-select at signup (never `admin`). */
export type SignupRole = 'athlete' | 'coach' | 'club';

/** Creates the common 1–1 profile row for a user if it does not exist yet. */
export async function ensureProfile(userId: number, displayName?: string) {
  await db
    .insert(profiles)
    .values({ userId, displayName: displayName ?? null })
    .onConflictDoNothing({ target: profiles.userId });
}

/**
 * Sets (or clears) a user's avatar URL, creating the profile row if needed.
 * Returns the stored value.
 */
export async function setAvatarUrl(userId: number, url: string | null) {
  await ensureProfile(userId);
  await db
    .update(profiles)
    .set({ avatarUrl: url, updatedAt: new Date() })
    .where(eq(profiles.userId, userId));
  return url;
}

/** Reads a user's avatar URL (null when unset / no profile). */
export async function getAvatarUrl(userId: number): Promise<string | null> {
  const [row] = await db
    .select({ avatarUrl: profiles.avatarUrl })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return row?.avatarUrl ?? null;
}

/** Assigns a role to a user (idempotent on the (user_id, role_key) unique). */
export async function assignRole(userId: number, roleKey: string) {
  await db
    .insert(userRoles)
    .values({ userId, roleKey })
    .onConflictDoNothing();
}

/** Creates the athlete-side client profile if missing. */
export async function ensureClientProfile(userId: number) {
  await db
    .insert(clientProfiles)
    .values({ userId })
    .onConflictDoNothing({ target: clientProfiles.userId });
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return base || 'coach';
}

/** Picks a unique provider slug, falling back to a userId-suffixed variant. */
async function uniqueSlug(base: string, userId: number): Promise<string> {
  const candidate = slugify(base);
  const existing = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.slug, candidate))
    .limit(1);
  return existing.length > 0 ? `${candidate}-${userId}` : candidate;
}

/** Creates the coach-side provider profile (status `draft`) if missing. */
export async function ensureProviderProfile(
  userId: number,
  slugBase: string
) {
  const slug = await uniqueSlug(slugBase, userId);
  await db
    .insert(providerProfiles)
    .values({ userId, slug })
    .onConflictDoNothing({ target: providerProfiles.userId });
}

/**
 * Provisions a newly signed-up user for their chosen marketplace role:
 * always a `profiles` row + a `user_roles` row, plus the role-specific profile
 * (`client_profiles` for athlete, `provider_profiles` for coach). `club` needs
 * no extra per-user profile in Phase 1 (the organization is the `teams` row).
 */
export async function provisionMarketplaceRole(
  userId: number,
  role: SignupRole,
  opts: { email: string; displayName?: string }
) {
  await ensureProfile(userId, opts.displayName);
  await assignRole(userId, role);

  if (role === 'athlete') {
    await ensureClientProfile(userId);
  } else if (role === 'coach') {
    const slugBase = opts.displayName || opts.email.split('@')[0];
    await ensureProviderProfile(userId, slugBase);
  }
}

import 'server-only';
import { eq } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  profiles,
  userRoles,
  clientProfiles,
  providerProfiles,
  type ProviderProfile,
} from '@/lib/db/schema';

/** Marketplace roles a user can self-select at signup (never `admin`). */
export type SignupRole = 'athlete' | 'coach' | 'club';

/** Creates the common 1–1 profile row for a user if it does not exist yet. */
export async function ensureProfile(
  userId: number,
  displayName?: string,
  exec: DbOrTx = db
) {
  await exec
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
export async function assignRole(
  userId: number,
  roleKey: string,
  exec: DbOrTx = db
) {
  await exec
    .insert(userRoles)
    .values({ userId, roleKey })
    .onConflictDoNothing();
}

/** Creates the athlete-side client profile if missing. */
export async function ensureClientProfile(userId: number, exec: DbOrTx = db) {
  await exec
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
async function uniqueSlug(
  base: string,
  userId: number,
  exec: DbOrTx = db
): Promise<string> {
  const candidate = slugify(base);
  const existing = await exec
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.slug, candidate))
    .limit(1);
  return existing.length > 0 ? `${candidate}-${userId}` : candidate;
}

/** Creates the coach-side provider profile (status `draft`) if missing. */
export async function ensureProviderProfile(
  userId: number,
  slugBase: string,
  exec: DbOrTx = db
) {
  const slug = await uniqueSlug(slugBase, userId, exec);
  await exec
    .insert(providerProfiles)
    .values({ userId, slug })
    .onConflictDoNothing({ target: providerProfiles.userId });
}

/** Returns the coach's provider profile (null if none). */
export async function getProviderProfileByUser(
  userId: number
): Promise<ProviderProfile | null> {
  const [row] = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Updates a coach's editable profile fields. Status is intentionally left
 * unchanged: edits never auto-approve a profile, and never demote an already
 * `approved` one. Status transitions go through `submitProviderForReview`
 * (coach) and the admin approval queue.
 */
export async function updateProviderProfileFields(
  userId: number,
  fields: {
    headline?: string | null;
    description?: string | null;
    categories?: string[];
    specialties?: string[];
  }
) {
  await db
    .update(providerProfiles)
    .set({
      headline: fields.headline ?? null,
      description: fields.description ?? null,
      categories: fields.categories ?? [],
      specialties: fields.specialties ?? [],
      updatedAt: new Date(),
    })
    .where(eq(providerProfiles.userId, userId));
}

/**
 * Coach-driven submission for admin review. Moves `draft` or `rejected`
 * profiles to `pending`. `approved` / `pending` are left untouched (the admin
 * approval queue still governs public visibility). Returns the resulting
 * status, or null if no profile exists.
 */
export async function submitProviderForReview(
  userId: number
): Promise<string | null> {
  const provider = await getProviderProfileByUser(userId);
  if (!provider) return null;
  if (provider.status === 'draft' || provider.status === 'rejected') {
    await db
      .update(providerProfiles)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(providerProfiles.userId, userId));
    return 'pending';
  }
  return provider.status;
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
  opts: { email: string; displayName?: string },
  exec: DbOrTx = db
) {
  await ensureProfile(userId, opts.displayName, exec);
  await assignRole(userId, role, exec);

  if (role === 'athlete') {
    await ensureClientProfile(userId, exec);
  } else if (role === 'coach') {
    const slugBase = opts.displayName || opts.email.split('@')[0];
    await ensureProviderProfile(userId, slugBase, exec);
  }
}

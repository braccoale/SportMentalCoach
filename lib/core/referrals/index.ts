import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import { referralCodes, referrals, users } from '@/lib/db/schema';
import {
  buildInviteUrl,
  firstNameForDisplay,
  generateInviteCode,
  isValidCodeFormat,
  normaliseCode,
} from './code';

export {
  buildInviteUrl,
  firstNameForDisplay,
  isValidCodeFormat,
  normaliseCode,
} from './code';

export type InviteCode = { code: string; url: string };

/**
 * The user's stable personal invite code — created on first use and reused
 * forever after. Idempotent and race-safe: concurrent callers converge on the
 * one row guaranteed by the `user_id` unique constraint, and code collisions
 * (astronomically rare) are retried.
 */
export async function getOrCreateInviteCode(
  userId: number
): Promise<InviteCode> {
  const [existing] = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1);
  if (existing) return { code: existing.code, url: buildInviteUrl(existing.code) };

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateInviteCode();
    try {
      const [row] = await db
        .insert(referralCodes)
        .values({ userId, code, createdBy: userId })
        // Another request created this user's code first (unique user_id) → no
        // row comes back; we fetch the winner below instead of erroring.
        .onConflictDoNothing({ target: referralCodes.userId })
        .returning({ code: referralCodes.code });
      if (row) return { code: row.code, url: buildInviteUrl(row.code) };

      const [winner] = await db
        .select({ code: referralCodes.code })
        .from(referralCodes)
        .where(eq(referralCodes.userId, userId))
        .limit(1);
      if (winner) return { code: winner.code, url: buildInviteUrl(winner.code) };
    } catch (err) {
      // Duplicate `code` (different unique constraint): retry with a new one.
      if (attempt === 5) throw err;
    }
  }
  throw new Error('Could not allocate an invite code.');
}

export type PublicInvite = {
  valid: boolean;
  /** Inviter's first name only, or null → caller shows "Un amico". */
  inviterFirstName: string | null;
};

/**
 * Public, unauthenticated resolution of a code. Returns ONLY whether the code
 * is usable and the inviter's first name — never email, last name or user id.
 */
export async function resolvePublicInvite(rawCode: string): Promise<PublicInvite> {
  const code = normaliseCode(rawCode);
  if (!isValidCodeFormat(code)) return { valid: false, inviterFirstName: null };

  const [row] = await db
    .select({ name: users.name })
    .from(referralCodes)
    .innerJoin(users, eq(users.id, referralCodes.userId))
    .where(and(eq(referralCodes.code, code), eq(referralCodes.active, true)))
    .limit(1);

  if (!row) return { valid: false, inviterFirstName: null };
  return { valid: true, inviterFirstName: firstNameForDisplay(row.name) };
}

/** Best-effort +1 on the open counter. Never throws (analytics is not critical). */
export async function incrementOpenCount(rawCode: string): Promise<void> {
  const code = normaliseCode(rawCode);
  if (!isValidCodeFormat(code)) return;
  try {
    await db
      .update(referralCodes)
      .set({ openCount: sql`${referralCodes.openCount} + 1`, updatedAt: new Date() })
      .where(and(eq(referralCodes.code, code), eq(referralCodes.active, true)));
  } catch {
    // ignore — a missed count must never surface to the visitor
  }
}

/**
 * Attributes a freshly-registered user to the inviter behind `rawCode`.
 * Best-effort and defensive by design — it must NEVER block or roll back a
 * signup:
 *  - invalid / inactive / unknown code → no-op;
 *  - self-invite → no-op;
 *  - user already attributed → no-op (the `referred_user_id` unique wins the race).
 */
export async function attributeReferral(
  params: { rawCode: string | null | undefined; referredUserId: number },
  tx: DbOrTx = db
): Promise<void> {
  const raw = params.rawCode;
  if (!raw) return;
  const code = normaliseCode(raw);
  if (!isValidCodeFormat(code)) return;

  try {
    const [inviteRow] = await tx
      .select({ id: referralCodes.id, userId: referralCodes.userId })
      .from(referralCodes)
      .where(and(eq(referralCodes.code, code), eq(referralCodes.active, true)))
      .limit(1);
    if (!inviteRow) return;
    if (inviteRow.userId === params.referredUserId) return; // no self-invite

    await tx
      .insert(referrals)
      .values({
        codeId: inviteRow.id,
        inviterUserId: inviteRow.userId,
        referredUserId: params.referredUserId,
        createdBy: params.referredUserId,
      })
      // Already attributed to someone → keep the first attribution, don't overwrite.
      .onConflictDoNothing({ target: referrals.referredUserId });
  } catch (err) {
    console.error('attributeReferral failed (ignored):', err);
  }
}

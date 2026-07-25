import { getUser } from '@/lib/db/queries';
import { getOrCreateInviteCode } from '@/lib/core/referrals';

/**
 * Returns the authenticated user's personal invite link, creating the code on
 * first call and reusing it thereafter. 401 for anonymous callers — a code
 * must always belong to a real, logged-in user.
 */
export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { code, url } = await getOrCreateInviteCode(user.id);
  return Response.json({ code, url });
}

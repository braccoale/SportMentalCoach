import { incrementOpenCount } from '@/lib/core/referrals';

/**
 * Best-effort "link opened" counter for the public invite page. Public by
 * design (the visitor isn't logged in) and deliberately cheap: it only bumps a
 * counter for a valid, active code and never reveals anything. The client
 * dedupes per browser so a refresh doesn't inflate the count.
 */
export async function POST(request: Request) {
  let code: unknown;
  try {
    ({ code } = await request.json());
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (typeof code !== 'string') {
    return Response.json({ ok: false }, { status: 400 });
  }
  await incrementOpenCount(code);
  return Response.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { saveSubscription, removeUserSubscription } from '@/lib/core/push';

/** Registers a browser's push subscription for the signed-in user. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let sub: unknown;
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const s = sub as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) {
    return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  }

  await saveSubscription(user.id, {
    endpoint: s.endpoint,
    keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
  });
  return NextResponse.json({ ok: true });
}

/** Removes a subscription (on unsubscribe). Body: { endpoint }. */
export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let endpoint: string | undefined;
  try {
    endpoint = (await req.json())?.endpoint;
  } catch {
    /* ignore */
  }
  // Scoped to the caller: posting someone else's endpoint deletes nothing.
  if (endpoint) await removeUserSubscription(user.id, endpoint);
  return NextResponse.json({ ok: true });
}

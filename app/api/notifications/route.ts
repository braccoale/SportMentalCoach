import { getUser } from '@/lib/db/queries';
import { getRecentWithCount } from '@/lib/core/notifications';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ authenticated: false, unreadCount: 0, items: [] });
  }
  const { unreadCount, items } = await getRecentWithCount(user.id, 10);
  return Response.json({ authenticated: true, unreadCount, items });
}

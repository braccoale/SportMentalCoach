import { getUser } from '@/lib/core/auth';
import { getPendingRequestCount } from '@/lib/core/bookings';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { CoachNav } from './coach-nav';

export default async function CoachAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tab badges: pending requests (Dashboard) + unread messages (Messaggi).
  const user = await getUser();
  const [pendingCount, unreadMessages] = user
    ? await Promise.all([
        getPendingRequestCount(user.id),
        getUnreadCountForType(user.id, 'new_message'),
      ])
    : [0, 0];

  return (
    <div className="flex flex-col">
      <CoachNav pendingCount={pendingCount} unreadMessages={unreadMessages} />
      {children}
    </div>
  );
}

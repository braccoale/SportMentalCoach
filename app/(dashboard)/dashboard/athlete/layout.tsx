import { getUser } from '@/lib/core/auth';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { athleteHasPurchases } from '@/lib/core/billing';
import { AthleteNav } from './athlete-nav';

export default async function AthleteAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  const [unreadMessages, hasSubscriptions] = user
    ? await Promise.all([
        getUnreadCountForType(user.id, 'new_message'),
        athleteHasPurchases(user.id),
      ])
    : [0, false];

  return (
    <div className="flex flex-col">
      <AthleteNav
        unreadMessages={unreadMessages}
        hasSubscriptions={hasSubscriptions}
        athleteName={
          user
            ? [user.name, user.lastName].filter(Boolean).join(' ') || null
            : null
        }
      />
      {children}
    </div>
  );
}

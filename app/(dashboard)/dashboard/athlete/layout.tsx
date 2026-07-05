import { getUser } from '@/lib/core/auth';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { AthleteNav } from './athlete-nav';

export default async function AthleteAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  const unreadMessages = user
    ? await getUnreadCountForType(user.id, 'new_message')
    : 0;

  return (
    <div className="flex flex-col">
      <AthleteNav
        unreadMessages={unreadMessages}
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

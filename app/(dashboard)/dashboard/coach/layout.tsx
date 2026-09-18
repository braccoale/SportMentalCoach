import { getUser } from '@/lib/core/auth';
import { getPendingRequestCount } from '@/lib/core/bookings';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { listSessionsForUser } from '@/lib/core/academy/sessions';
import { countCoursesWithUpcomingSessions } from '@/lib/core/academy/upcoming-sessions';
import { CoachNav } from './coach-nav';

// Il badge Academy deve riflettere lo stato reale a ogni apertura — non solo
// della pagina Academy, ma di questo layout che la incornicia su ogni tab
// della sezione coach. Senza `force-dynamic` una navigazione lato client tra
// tab può servire un rendering di layout cache da prima che una sessione
// fosse creata o annullata altrove.
export const dynamic = 'force-dynamic';

export default async function CoachAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tab badges: pending requests (Dashboard) + unread messages (Messaggi) +
  // corsi Academy con almeno una sessione futura pianificata.
  const user = await getUser();
  const [pendingCount, unreadMessages, academySessions] = user
    ? await Promise.all([
        getPendingRequestCount(user.id),
        getUnreadCountForType(user.id, 'new_message'),
        listSessionsForUser(user.id),
      ])
    : [0, 0, []];
  const academyCourseCount = countCoursesWithUpcomingSessions(academySessions);

  return (
    <div className="flex flex-col">
      <CoachNav
        pendingCount={pendingCount}
        unreadMessages={unreadMessages}
        academyCourseCount={academyCourseCount}
        coachName={
          user
            ? [user.name, user.lastName].filter(Boolean).join(' ') || null
            : null
        }
      />
      {children}
    </div>
  );
}

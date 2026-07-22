import { redirect } from 'next/navigation';
import { getUser } from '@/lib/core/auth';
import { getPendingRequestCount } from '@/lib/core/bookings';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { hasAcceptedCoachAgreement } from '@/lib/core/legal/acceptance';
import { CoachNav } from './coach-nav';

export default async function CoachAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tab badges: pending requests (Dashboard) + unread messages (Messaggi).
  const user = await getUser();

  // Contratto non firmato (o versione superata): l'area coach non si apre.
  // È il gate di comodità; quello che conta davvero sta nelle azioni.
  if (user && !(await hasAcceptedCoachAgreement(user.id))) {
    redirect('/onboarding/coach-agreement');
  }

  const [pendingCount, unreadMessages] = user
    ? await Promise.all([
        getPendingRequestCount(user.id),
        getUnreadCountForType(user.id, 'new_message'),
      ])
    : [0, 0];

  return (
    <div className="flex flex-col">
      <CoachNav
        pendingCount={pendingCount}
        unreadMessages={unreadMessages}
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

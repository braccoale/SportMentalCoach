import { getUser } from '@/lib/core/auth';
import { getPendingRequestCount } from '@/lib/core/bookings';
import { CoachNav } from './coach-nav';

export default async function CoachAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pending-request badge on the Dashboard tab (0 when not applicable).
  const user = await getUser();
  const pendingCount = user ? await getPendingRequestCount(user.id) : 0;

  return (
    <div className="flex flex-col">
      <CoachNav pendingCount={pendingCount} />
      {children}
    </div>
  );
}

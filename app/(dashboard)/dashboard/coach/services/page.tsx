import { requireRole } from '@/lib/core/auth';
import { getCoachAvailability } from '@/lib/core/availability';
import { AvailabilityEditor } from '../availability-editor';

export default async function CoachServicesPage() {
  const user = await requireRole('coach');
  const availability = await getCoachAvailability(user.id);

  return (
    <section className="flex flex-col gap-6 p-6">
      <AvailabilityEditor slots={availability} />
    </section>
  );
}

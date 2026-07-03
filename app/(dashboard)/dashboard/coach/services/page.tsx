import { requireRole } from '@/lib/core/auth';
import { getCoachServices } from '@/lib/core/services';
import { getCoachAvailability } from '@/lib/core/availability';
import { ServicesEditor } from '../services-editor';
import { AvailabilityEditor } from '../availability-editor';

export default async function CoachServicesPage() {
  const user = await requireRole('coach');

  const [services, availability] = await Promise.all([
    getCoachServices(user.id),
    getCoachAvailability(user.id),
  ]);

  return (
    <section className="flex flex-col gap-6 p-6">
      <ServicesEditor services={services} />
      <AvailabilityEditor slots={availability} />
    </section>
  );
}

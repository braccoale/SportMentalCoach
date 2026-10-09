import { requireRole } from '@/lib/core/auth';
import { getCoachServices } from '@/lib/core/services';
import { getCoachAvailability } from '@/lib/core/availability';
import { CoachRateSuggestion } from '@/components/coach-rate-suggestion';
import { getRateSuggestionForCoach } from '@/lib/core/rate-suggestion/server';
import { ServicesEditor } from '../services-editor';
import { AvailabilityEditor } from '../availability-editor';

export default async function CoachServicesPage() {
  const user = await requireRole('coach');

  const [services, availability, rateSuggestion] = await Promise.all([
    getCoachServices(user.id),
    getCoachAvailability(user.id),
    // Un guasto qui toglie il suggerimento, non la pagina.
    getRateSuggestionForCoach(user.id).catch((error) => {
      console.error('[coach] tariffa suggerita non calcolata', error);
      return null;
    }),
  ]);

  return (
    <section className="flex flex-col gap-6 p-6">
      {rateSuggestion && <CoachRateSuggestion suggestion={rateSuggestion} />}
      <ServicesEditor services={services} rateLevel={rateSuggestion?.level ?? null} />
      <AvailabilityEditor slots={availability} />
    </section>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCoachRelationshipAthletes } from '@/lib/core/bookings';
import {
  MentalJourneyError,
  getMentalJourney,
} from '@/lib/core/ai-session-notes/mental-journey';
import { mentalJourneyDependencies } from '@/lib/core/ai-session-notes/mental-journey-store';
import { MentalJourneyView } from '@/components/mental-journey';

export const dynamic = 'force-dynamic';

/**
 * Pagina Mental Journey del coach. Legge il dominio direttamente, senza
 * passare dalla propria API: stessa autorizzazione, una richiesta in meno.
 */
export default async function CoachMentalJourneyPage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const user = await requireRole('coach');
  const athleteUserId = Number((await params).athleteId);
  if (!Number.isInteger(athleteUserId) || athleteUserId <= 0) notFound();

  let journey;
  try {
    journey = await getMentalJourney(
      { athleteUserId, actorUserId: user.id },
      mentalJourneyDependencies()
    );
  } catch (error) {
    if (error instanceof MentalJourneyError) notFound();
    throw error;
  }

  const athletes = await getCoachRelationshipAthletes(user.id);
  const athleteName = athletes.find((athlete) => athlete.userId === athleteUserId)?.name ?? null;

  return (
    <section className="flex flex-col gap-6 p-4 sm:p-6">
      <Link
        href="/dashboard/coach"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Torna alla dashboard
      </Link>

      <MentalJourneyView journey={journey} athleteName={athleteName} />
    </section>
  );
}

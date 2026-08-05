import Link from 'next/link';
import { Compass } from 'lucide-react';
import { CoachAvatar } from '@/components/coach-visuals';
import type { RelationshipAthlete } from '@/lib/core/bookings';

/**
 * Punto d'ingresso alla Mental Journey dalla dashboard coach: un elenco
 * essenziale degli atleti seguiti, senza anticipare alcun contenuto del
 * percorso.
 *
 * `enabled` è obbligatoria di proposito. I dati del percorso sono già protetti
 * dall'entitlement, quindi un coach senza la funzionalità non potrebbe comunque
 * leggerli — ma vedeva la sezione, e mostrare la porta di una stanza chiusa è
 * un modo per promettere qualcosa che non c'è. Richiedere la prop fa sì che un
 * nuovo punto di ingresso non possa nascere senza che qualcuno decida.
 */
export function MentalJourneyLinks({
  athletes,
  enabled,
}: {
  athletes: readonly RelationshipAthlete[];
  /** Se il coach ha la funzionalità AI Session Notes attiva sul suo account. */
  enabled: boolean;
}) {
  if (!enabled) return null;
  if (!athletes.length) return null;

  return (
    <section aria-labelledby="mental-journey-links-title">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-violet-600" />
        <h2 id="mental-journey-links-title" className="text-lg font-medium text-gray-900">
          Mental Journey
        </h2>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        La memoria dei percorsi che segui, costruita dai report che hai approvato.
      </p>

      <ul className="mt-4 flex flex-wrap gap-3">
        {athletes.map((athlete) => (
          <li key={athlete.userId}>
            <Link
              href={`/dashboard/coach/athletes/${athlete.userId}/mental-journey`}
              className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-gray-200 transition-colors hover:ring-violet-300"
            >
              <CoachAvatar name={athlete.name} src={athlete.avatarUrl} className="size-9" />
              <span className="text-sm font-medium text-gray-900">{athlete.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

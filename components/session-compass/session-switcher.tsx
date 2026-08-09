'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  sessionNeighbours,
  type NavigableSession,
} from './session-neighbours';

/**
 * Il navigatore fra le sedute, in cima al riepilogo.
 *
 * Un riepilogo si legge quasi sempre in rapporto a quello prima — «questo
 * tema torna?», «l'impegno di due settimane fa è stato ripreso?» — e la
 * navigazione richiedeva di aprire una scheda, scegliere una seduta da una
 * linea del tempo e premere «apri». Tre gesti per una cosa che ne merita uno.
 *
 * Compare solo quando c'è dove andare: su un percorso di una seduta sola una
 * barra con due frecce spente è rumore.
 */
export function SessionSwitcher({
  sessions,
  currentSessionId,
  currentDate,
}: {
  sessions: readonly NavigableSession[];
  currentSessionId: number;
  currentDate?: string | null;
}) {
  const { previous, next, position, total } = sessionNeighbours({
    sessions,
    currentSessionId,
  });
  if (!previous && !next) return null;

  const label = currentDate
    ? new Date(currentDate).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Sessione corrente';

  return (
    <nav
      aria-label="Naviga fra le sedute"
      className="mb-4 flex items-center justify-between gap-3 rounded-full border border-gray-200 bg-white px-2 py-1.5"
    >
      <Step
        session={previous}
        direction="previous"
        label="Seduta precedente"
      />

      <p className="min-w-0 text-center">
        <span className="block truncate text-sm font-semibold text-gray-950">
          {label}
        </span>
        <span className="block text-[11px] text-gray-500">
          {position} di {total}
        </span>
      </p>

      <Step session={next} direction="next" label="Seduta successiva" />
    </nav>
  );
}

/**
 * Un passo, o il suo posto vuoto.
 *
 * Il posto resta occupato anche quando non c'è dove andare: senza, la data al
 * centro scivolerebbe a sinistra sulla prima seduta e a destra sull'ultima, e
 * l'occhio la inseguirebbe a ogni passaggio.
 */
function Step({
  session,
  direction,
  label,
}: {
  session: NavigableSession | null;
  direction: 'previous' | 'next';
  label: string;
}) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  if (!session) {
    return <span className="size-9 shrink-0" aria-hidden="true" />;
  }
  return (
    <Link
      href={session.compassHref}
      aria-label={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-violet-700 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      <Icon className="size-5" aria-hidden="true" />
    </Link>
  );
}

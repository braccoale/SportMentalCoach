'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  placeSessionsOnTimeline,
  sessionNeighbours,
  type NavigableSession,
} from './session-neighbours';

/**
 * La linea del tempo del percorso, in cima al riepilogo.
 *
 * Un riepilogo si legge quasi sempre in rapporto a quello prima — «questo
 * tema torna?», «l'impegno di due settimane fa è stato ripreso?» — e la
 * navigazione richiedeva di aprire una scheda, scegliere da un elenco e
 * premere «apri». Tre gesti per una cosa che ne merita uno.
 *
 * Non è un impaginatore travestito: i punti stanno dove cadono nel tempo. Due
 * incontri a due giorni di distanza e poi un mese di pausa raccontano qualcosa
 * del percorso, e distribuirli a intervalli uguali cancellerebbe proprio
 * quello. Il ritmo del lavoro si vede prima di leggere una data.
 *
 * Compare solo quando c'è dove andare: su un percorso di una seduta sola,
 * una linea con un punto solo è decorazione.
 */

export type TimelineSession = NavigableSession & {
  /** Il tema principale di quella seduta, per l'anteprima al passaggio. */
  focus?: string | null;
};

function shortDate(value: string | null): string {
  if (!value) return 'senza data';
  return new Date(value).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
  });
}

function longDate(value: string | null): string {
  if (!value) return 'Sessione corrente';
  return new Date(value).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function SessionSwitcher({
  sessions,
  currentSessionId,
  currentDate,
}: {
  sessions: readonly TimelineSession[];
  currentSessionId: number;
  currentDate?: string | null;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { previous, next, position, total } = sessionNeighbours({
    sessions,
    currentSessionId,
  });
  if (!previous && !next) return null;

  const placed = placeSessionsOnTimeline(sessions);
  const focusOf = new Map(
    sessions.map((entry) => [entry.sessionId, entry.focus ?? null])
  );
  const preview = hovered === null ? null : placed.find((e) => e.sessionId === hovered);

  return (
    <nav
      aria-label="Percorso dell’atleta"
      className="mb-4 rounded-2xl border border-gray-200 bg-white px-3 py-3 sm:px-4"
    >
      <div className="flex items-center gap-3">
        <Step session={previous} direction="previous" label="Seduta precedente" />

        <div className="min-w-0 flex-1">
          {/* La riga è un riferimento, non un dato: resta il più discreta
              possibile e non compete con i punti. */}
          <div className="relative h-9">
            <span
              aria-hidden="true"
              className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-gray-200"
            />
            {placed.map((entry) => {
              const isCurrent = entry.sessionId === currentSessionId;
              return (
                <Link
                  key={entry.sessionId}
                  href={entry.compassHref}
                  aria-label={`Seduta del ${longDate(entry.sessionDate)}`}
                  aria-current={isCurrent ? 'page' : undefined}
                  onMouseEnter={() => setHovered(entry.sessionId)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(entry.sessionId)}
                  onBlur={() => setHovered(null)}
                  style={{ left: `${entry.offsetPercent}%` }}
                  // Il bersaglio è largo trentadue pixel anche se il punto ne
                  // occupa dieci: si clicca con il pollice, non con il mouse.
                  className="absolute top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  <span
                    className={
                      isCurrent
                        ? 'size-3.5 rounded-full bg-[#5b21b6] ring-4 ring-violet-100'
                        : 'size-2.5 rounded-full bg-[#8b5cf6] transition group-hover:scale-125'
                    }
                  />
                </Link>
              );
            })}
          </div>

          {/* Le date agli estremi danno la scala; quella al centro dice dove
              si è. Tre etichette, non una per punto: un numero su ogni punto
              renderebbe illeggibile proprio ciò che deve orientare. */}
          <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px] text-gray-500">
            <span>{shortDate(placed[0]?.sessionDate ?? null)}</span>
            <span className="truncate text-center font-semibold text-gray-950">
              {preview
                ? longDate(preview.sessionDate)
                : longDate(currentDate ?? null)}
              {preview && focusOf.get(preview.sessionId) ? (
                <span className="ml-2 font-normal text-gray-500">
                  {focusOf.get(preview.sessionId)}
                </span>
              ) : null}
            </span>
            <span>{shortDate(placed[placed.length - 1]?.sessionDate ?? null)}</span>
          </div>
        </div>

        <Step session={next} direction="next" label="Seduta successiva" />
      </div>

      <p className="mt-1 text-center text-[11px] text-gray-500">
        Seduta {position} di {total}
      </p>
    </nav>
  );
}

/**
 * Un passo, o il suo posto vuoto.
 *
 * Il posto resta occupato anche quando non c'è dove andare: senza, la linea
 * si allargherebbe sulla prima e sull'ultima seduta e l'occhio inseguirebbe i
 * punti a ogni passaggio.
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

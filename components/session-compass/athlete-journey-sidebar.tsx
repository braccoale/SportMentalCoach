'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronDown, History } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';
import { DashboardEmptyState } from './ui';

const INITIAL_VISIBLE = 6;

export function formatJourneyDate(value: string | null): string {
  if (!value) return 'Senza data';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Senza data';
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })
    .format(parsed);
}

/** Takeaway breve: due righe al massimo, mai il summary integrale. */
function takeaway(entry: MentalJourneyEntry): string {
  return entry.focus ?? entry.themes[0] ?? entry.summary;
}

/**
 * Percorso dell'atleta, sempre raggiungibile dalla Panoramica.
 *
 * Elenca soltanto le sessioni con report *approvato*: lo storico non contiene
 * bozze, quindi lo stato mostrato è sempre quello reale e non viene simulato.
 * Sotto `xl` il pannello diventa collassabile per non spingere il contenuto
 * principale sotto la piega.
 */
export function AthleteJourneySidebar({
  timeline,
  currentSessionId,
  currentSessionDate,
  currentFocus,
  currentIsApproved,
  selectedId = null,
  onSelect,
  className = '',
}: {
  timeline: readonly MentalJourneyEntry[];
  currentSessionId: number;
  currentSessionDate: string | null;
  currentFocus: string | null;
  currentIsApproved: boolean;
  selectedId?: number | null;
  onSelect?: (sessionId: number) => void;
  className?: string;
}) {
  const history = timeline.filter((entry) => entry.sessionId !== currentSessionId);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const visibleHistory = history.slice(0, visibleCount);
  const totalSessions = history.length + 1;

  const body = (
    <>
      <ol className="mt-4 space-y-1" aria-label="Sessioni del percorso dell’atleta">
        <li
          aria-current="step"
          className="relative rounded-xl border border-violet-200 bg-violet-50 p-3 pl-9"
        >
          {history.length ? (
            <span className="absolute left-[1.05rem] top-8 h-full w-px bg-violet-200" aria-hidden="true" />
          ) : null}
          <span className="absolute left-3.5 top-4 h-3 w-3 rounded-full bg-violet-600 ring-4 ring-violet-100" aria-hidden="true" />
          <p className="text-xs font-bold text-violet-700">
            Sessione corrente · {formatJourneyDate(currentSessionDate)}
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-gray-950">
            {currentFocus ?? 'Focus non identificato'}
          </p>
          <p className="mt-1.5 text-[11px] font-semibold text-violet-700">
            {currentIsApproved ? 'Report approvato' : 'Report in bozza'}
          </p>
        </li>

        {visibleHistory.map((entry) => (
          <li key={entry.sessionId}>
            <JourneyEntryRow
              entry={entry}
              selected={entry.sessionId === selectedId}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ol>

      {visibleCount < history.length ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setVisibleCount((current) => current + INITIAL_VISIBLE)}
        >
          Mostra altre sessioni ({history.length - visibleCount})
        </Button>
      ) : null}

      {!history.length ? (
        <DashboardEmptyState
          className="mt-3"
          icon={<History className="h-4 w-4" />}
          title="Questa è la prima sessione analizzata"
          description="I confronti compariranno dopo l’approvazione delle prossime sessioni."
        />
      ) : null}
    </>
  );

  const shell = `min-w-0 max-w-full rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${className}`;

  return (
    <>
      {/* Sotto xl il pannello è collassabile: Chrome nasconde lo slot di
          `details`, quindi il desktop usa una struttura separata invece di
          forzare l'apertura via CSS. */}
      <details className={`group xl:hidden ${shell}`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
              Percorso atleta
            </span>
            <span className="mt-0.5 block text-sm font-bold text-gray-950">
              {totalSessions} {totalSessions === 1 ? 'sessione' : 'sessioni'} nel percorso
            </span>
          </span>
          <ChevronDown
            className="h-5 w-5 shrink-0 text-gray-500 transition group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="px-4 pb-4">{body}</div>
      </details>

      <aside className={`hidden p-5 xl:block ${shell}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
          Percorso atleta
        </p>
        <h3 className="mt-1 text-base font-bold text-gray-950">Sessione per sessione</h3>
        {body}
      </aside>
    </>
  );
}

function JourneyEntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: MentalJourneyEntry;
  selected: boolean;
  onSelect?: (sessionId: number) => void;
}) {
  const body = (
    <>
      <span className="absolute left-[1.05rem] top-0 h-full w-px bg-gray-200" aria-hidden="true" />
      <span className="absolute left-3.5 top-4 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-white" aria-hidden="true" />
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-gray-500">{formatJourneyDate(entry.sessionDate)}</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> Approvato
        </span>
      </span>
      <span className="mt-1 block line-clamp-2 text-sm font-bold leading-5 text-gray-950">
        {takeaway(entry)}
      </span>
    </>
  );

  const shell = `relative block w-full rounded-xl border p-3 pl-9 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
    selected ? 'border-gray-300 bg-gray-50' : 'border-transparent hover:bg-gray-50'
  }`;

  if (onSelect) {
    return (
      <button type="button" aria-pressed={selected} className={shell} onClick={() => onSelect(entry.sessionId)}>
        {body}
      </button>
    );
  }
  return (
    <Link href={entry.compassHref} className={shell} aria-label={`Apri la sessione del ${formatJourneyDate(entry.sessionDate)}`}>
      {body}
    </Link>
  );
}

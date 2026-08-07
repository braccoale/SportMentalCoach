'use client';

import { ArrowRight, FileText, Loader2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';
import { formatJourneyDate } from './athlete-journey-sidebar';
import { formatTranscriptTimestamp } from './time';
import { DashboardEmptyState, SectionHeading, Surface } from './ui';
import { SPEAKER_LABEL, type CompassTranscriptSegment } from './types';

const PREVIEW_LIMIT = 3;

/**
 * Anteprima della sola sessione corrente. Le trascrizioni passate non vengono
 * mai precaricate: si aprono su richiesta dalla card dedicata.
 */
export function TranscriptPreview({
  transcript,
  loaded = true,
  loading,
  error,
  onLoad,
  onRetry,
  onOpenTranscript,
  className = '',
}: {
  transcript: readonly CompassTranscriptSegment[];
  /** `false` finché la trascrizione non è in cache: nessun fetch automatico. */
  loaded?: boolean;
  loading: boolean;
  error: string | null;
  onLoad: () => void;
  onRetry: () => void;
  onOpenTranscript: (segmentId?: number) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('it');
    if (!normalized) return transcript;
    return transcript.filter((segment) => segment.text.toLocaleLowerCase('it').includes(normalized));
  }, [query, transcript]);
  const visible = filtered.slice(0, PREVIEW_LIMIT);

  return (
    <Surface className={`flex flex-col ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading eyebrow="Conversazione" title="Trascrizione" />
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenTranscript()}>
          Apri completa <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {loaded ? (
        <label className="relative mt-4 block">
          <span className="sr-only">Cerca nella trascrizione della sessione corrente</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca nella trascrizione…"
            disabled={loading || !transcript.length}
            className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60"
          />
        </label>
      ) : null}

      <div className="mt-3 min-w-0 flex-1">
        {!loaded && !loading && !error ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 p-4">
            <p className="text-sm leading-6 text-gray-600">
              La trascrizione non viene caricata all’apertura del riepilogo.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-3 bg-white" onClick={onLoad}>
              Carica anteprima
            </Button>
          </div>
        ) : loading ? (
          <div className="flex min-h-24 items-center gap-2 text-sm text-gray-600" role="status">
            <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> Caricamento trascrizione…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3 bg-white" onClick={onRetry}>
              Riprova
            </Button>
          </div>
        ) : !transcript.length ? (
          <DashboardEmptyState
            icon={<FileText className="h-4 w-4" />}
            title="Trascrizione non disponibile"
            description="Per questa sessione non esiste ancora una trascrizione da consultare."
          />
        ) : !filtered.length ? (
          <DashboardEmptyState
            icon={<Search className="h-4 w-4" />}
            title="Nessun passaggio trovato"
            description="Nessun segmento della sessione contiene il testo cercato."
          />
        ) : (
          <ol className="divide-y divide-gray-100">
            {visible.map((segment) => (
              <li key={segment.transcriptSegmentId} className="py-2.5">
                <button
                  type="button"
                  className="group w-full rounded-lg px-1 text-left transition hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  onClick={() => onOpenTranscript(segment.transcriptSegmentId)}
                  aria-label={`Apri il passaggio delle ${formatTranscriptTimestamp(segment.startMs)} nella trascrizione completa`}
                >
                  <span className="flex items-center gap-2 text-xs font-bold text-violet-700">
                    {formatTranscriptTimestamp(segment.startMs)}
                    <span className="font-semibold text-gray-500">{SPEAKER_LABEL[segment.speaker]}</span>
                  </span>
                  <span className="mt-1 block line-clamp-2 text-sm leading-6 text-gray-800">
                    {segment.text}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {loaded && !loading && !error && filtered.length > PREVIEW_LIMIT ? (
        <p className="mt-2 text-xs text-gray-500">
          Altri {filtered.length - PREVIEW_LIMIT} passaggi nella trascrizione completa.
        </p>
      ) : null}
    </Surface>
  );
}

/**
 * Trascrizioni delle sessioni passate. Lo stato dichiarato è "su richiesta"
 * perché il caricamento è volutamente lazy: non conosciamo — né vogliamo
 * anticipare — il contenuto finché il coach non lo apre.
 */
export function PastTranscriptsPanel({
  timeline,
  currentSessionId,
  onOpenTranscript,
  className = '',
}: {
  timeline: readonly MentalJourneyEntry[];
  currentSessionId: number;
  onOpenTranscript: (sessionId: number) => void;
  className?: string;
}) {
  const history = timeline.filter((entry) => entry.sessionId !== currentSessionId);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? history : history.slice(0, PREVIEW_LIMIT);

  return (
    <Surface className={className}>
      <SectionHeading eyebrow="Storico" title="Trascrizioni passate" />
      {history.length ? (
        <>
          <ul className="mt-4 space-y-2">
            {visible.map((entry) => (
              <li
                key={entry.sessionId}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500">
                    {formatJourneyDate(entry.sessionDate)} · Su richiesta
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-sm font-bold text-gray-950">
                    {entry.focus ?? 'Focus non identificato'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onOpenTranscript(entry.sessionId)}
                >
                  Apri
                </Button>
              </li>
            ))}
          </ul>
          {history.length > PREVIEW_LIMIT ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              aria-expanded={showAll}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? 'Mostra meno' : `Mostra tutte (${history.length})`}
            </Button>
          ) : null}
        </>
      ) : (
        <DashboardEmptyState
          className="mt-4"
          icon={<FileText className="h-4 w-4" />}
          title="Nessuna sessione precedente"
          description="Le trascrizioni passate compariranno dopo l’approvazione di altre sessioni."
        />
      )}
    </Surface>
  );
}

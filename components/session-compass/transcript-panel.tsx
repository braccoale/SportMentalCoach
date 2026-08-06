'use client';

import { Check, Copy, Loader2, Search, UserRound, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SPEAKER_LABEL, segmentAnchorId, type CompassTranscriptSegment } from './types';

type SpeakerFilter = 'all' | 'coach' | 'athlete';

export function TranscriptPanel({
  transcript,
  loading,
  error,
  highlightedSegmentId,
  onRetry,
  eyebrow = 'Sessione corrente',
  title = 'Trascrizione',
  description = 'Cerca nella conversazione oppure filtra per speaker. I momenti chiave aprono il segmento corrispondente.',
}: {
  transcript: readonly CompassTranscriptSegment[];
  loading: boolean;
  error: string | null;
  highlightedSegmentId: number | null;
  onRetry: () => void;
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState<SpeakerFilter>('all');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(100);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('it');
    return transcript.filter((segment) => {
      if (speaker !== 'all' && segment.speaker !== speaker) return false;
      return !normalized || segment.text.toLocaleLowerCase('it').includes(normalized);
    });
  }, [query, speaker, transcript]);
  useEffect(() => setVisibleLimit(100), [query, speaker, transcript]);
  const highlightedIndex = highlightedSegmentId === null
    ? -1
    : filtered.findIndex((segment) => segment.transcriptSegmentId === highlightedSegmentId);
  const effectiveLimit = Math.max(visibleLimit, highlightedIndex + 1);
  const visibleSegments = filtered.slice(0, effectiveLimit);

  async function copySegment(segment: CompassTranscriptSegment) {
    await navigator.clipboard.writeText(
      `${SPEAKER_LABEL[segment.speaker]} · min ${segment.minute}\n${segment.text}`
    );
    setCopiedId(segment.transcriptSegmentId);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="border-b border-gray-200 p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-base font-bold text-gray-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-gray-600">
          {description}
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Cerca nella trascrizione</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca nella trascrizione…"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            />
          </label>
          <div className="flex gap-2" aria-label="Filtra per speaker">
            <FilterButton active={speaker === 'all'} onClick={() => setSpeaker('all')} icon={<UsersRound className="h-4 w-4" />}>
              Tutti
            </FilterButton>
            <FilterButton active={speaker === 'coach'} onClick={() => setSpeaker('coach')} icon={<UserRound className="h-4 w-4" />}>
              Coach
            </FilterButton>
            <FilterButton active={speaker === 'athlete'} onClick={() => setSpeaker('athlete')} icon={<UserRound className="h-4 w-4" />}>
              Atleta
            </FilterButton>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-600" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-violet-600" /> Caricamento trascrizione…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
            <p>{error}</p>
            <Button type="button" variant="outline" className="mt-3 bg-white" onClick={onRetry}>
              Riprova
            </Button>
          </div>
        ) : !transcript.length ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
            La trascrizione non è disponibile per questa sessione.
          </div>
        ) : !filtered.length ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
            Nessun segmento corrisponde alla ricerca o al filtro selezionato.
          </div>
        ) : (
          <>
          <ol className="divide-y divide-gray-100">
            {visibleSegments.map((segment) => {
              const highlighted = highlightedSegmentId === segment.transcriptSegmentId;
              return (
                <li
                  key={segment.transcriptSegmentId}
                  id={segmentAnchorId(segment.transcriptSegmentId)}
                  tabIndex={-1}
                  className={`grid scroll-mt-32 gap-2 py-4 transition sm:grid-cols-[5rem_6rem_1fr_auto] sm:gap-4 ${
                    highlighted ? 'rounded-xl bg-violet-50 px-3 ring-1 ring-violet-200' : ''
                  }`}
                >
                  <span className="text-xs font-bold text-violet-700">min {segment.minute}</span>
                  <span className="text-xs font-semibold text-gray-700">{SPEAKER_LABEL[segment.speaker]}</span>
                  <p className="text-sm leading-6 text-gray-800">{segment.text}</p>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    onClick={() => copySegment(segment)}
                    aria-label={`Copia estratto del minuto ${segment.minute}`}
                  >
                    {copiedId === segment.transcriptSegmentId ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </li>
              );
            })}
          </ol>
          {effectiveLimit < filtered.length ? (
            <Button
              type="button"
              variant="outline"
              className="mt-5 w-full"
              onClick={() => setVisibleLimit((current) => current + 100)}
            >
              Mostra altri passaggi ({filtered.length - effectiveLimit})
            </Button>
          ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
        active
          ? 'border-violet-200 bg-violet-50 text-violet-700'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
      onClick={onClick}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

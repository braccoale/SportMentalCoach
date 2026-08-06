'use client';

import { CalendarDays, Loader2, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  SPEAKER_LABEL,
  type TranscriptHistorySearchHit,
  type TranscriptHistorySearchResult,
} from './types';

export function TranscriptHistorySearch({
  athleteUserId,
  onOpenTranscript,
}: {
  athleteUserId: number;
  onOpenTranscript: (sessionId: number, segmentId?: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<TranscriptHistorySearchHit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setItems([]);
      setNextCursor(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchResults(athleteUserId, normalized, null, controller.signal);
        if (sequence !== requestSequence.current) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
      } catch (cause) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        setItems([]);
        setNextCursor(null);
        setError(cause instanceof Error ? cause.message : 'Ricerca non disponibile.');
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [athleteUserId, query]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchResults(athleteUserId, query.trim(), nextCursor);
      setItems((current) => [...current, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ricerca non disponibile.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Tutto il percorso</p>
      <h3 className="mt-1 text-base font-bold text-gray-950">Cerca nello storico delle trascrizioni</h3>
      <p className="mt-1 text-sm leading-6 text-gray-600">
        Trova una parola o un tema in tutte le sessioni approvate. Le trascrizioni complete si caricano solo quando apri un risultato.
      </p>
      <label className="relative mt-4 block">
        <span className="sr-only">Cerca in tutte le trascrizioni</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Es. fiducia, gara, concentrazione…"
          className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        />
      </label>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-600" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> Ricerca nello storico…
        </div>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
      {!loading && query.trim().length >= 2 && !error && !items.length ? (
        <p className="mt-4 text-sm text-gray-600">Nessun passaggio trovato nello storico approvato.</p>
      ) : null}
      {items.length ? (
        <div className="mt-4 divide-y divide-gray-100 border-y border-gray-100">
          {items.map((item) => (
            <button
              key={`${item.sessionId}-${item.transcriptSegmentId}`}
              type="button"
              className="grid w-full gap-2 py-4 text-left transition-colors hover:bg-violet-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 sm:grid-cols-[9rem_1fr_auto] sm:items-start sm:gap-4"
              onClick={() => onOpenTranscript(item.sessionId, item.transcriptSegmentId)}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(item.sessionDate)}
              </span>
              <span>
                <span className="block text-xs font-bold text-violet-700">
                  {SPEAKER_LABEL[item.speaker]} · min {item.minute}{item.focus ? ` · ${item.focus}` : ''}
                </span>
                <span className="mt-1 block text-sm leading-6 text-gray-800">{item.text}</span>
              </span>
              <span className="text-xs font-bold text-violet-700">Apri</span>
            </button>
          ))}
        </div>
      ) : null}
      {nextCursor ? (
        <Button type="button" variant="outline" className="mt-4" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Carica altri risultati
        </Button>
      ) : null}
    </section>
  );
}

async function fetchResults(
  athleteUserId: number,
  query: string,
  cursor: string | null,
  signal?: AbortSignal
): Promise<TranscriptHistorySearchResult> {
  const search = new URLSearchParams({ q: query });
  if (cursor) search.set('cursor', cursor);
  const response = await fetch(`/api/coach/athletes/${athleteUserId}/transcript-search?${search}`, {
    cache: 'no-store',
    signal,
  });
  const body = await response.json().catch(() => ({})) as Partial<TranscriptHistorySearchResult> & { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Ricerca non disponibile.');
  return {
    items: Array.isArray(body.items) ? body.items : [],
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
  };
}

function formatDate(value: string | null): string {
  if (!value) return 'Data non disponibile';
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

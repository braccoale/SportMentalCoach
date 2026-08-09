'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import type { NarrativeBeat } from '@/lib/core/ai-session-notes/session-compass-contract';
import { EvidenceReference, Surface, evidenceKey } from './ui';

/**
 * Il racconto della seduta.
 *
 * La sintesi risponde in tre righe a «cos'è successo». Questo risponde a
 * «come è andata»: l'ordine in cui le cose sono emerse, dove la
 * conversazione ha girato, come si è chiusa. Prima non esisteva da nessuna
 * parte, e per ricostruirlo il coach doveva rileggersi la trascrizione.
 *
 * Chiuso di default: è materiale da leggere quando serve, non da attraversare
 * ogni volta che si apre la Panoramica. Il pulsante lo dichiara, così chi lo
 * cerca lo trova e chi non lo vuole non ci inciampa.
 */
export function SessionNarrative({
  beats,
  citedEvidenceKeys,
  onOpenEvidence,
  className = '',
}: {
  beats: readonly NarrativeBeat[];
  citedEvidenceKeys?: ReadonlySet<string>;
  onOpenEvidence: (segmentId: number) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (beats.length === 0) return null;

  return (
    <Surface className={className} ariaLabel="Racconto della sessione">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
            <BookOpen className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
              Come è andata
            </span>
            <span className="mt-0.5 block text-base font-bold text-gray-950">
              Racconto della sessione
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-violet-700">
          {open ? 'Chiudi' : 'Leggi'}
          <ChevronDown
            className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <ol className="mt-5 space-y-5 border-t border-gray-200/80 pt-5">
          {beats.map((beat, index) => (
            <li key={beat.id} className="flex gap-4">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-950">{beat.title}</p>
                <p className="mt-1 text-[15px] leading-7 text-gray-700">
                  {beat.text}
                </p>
                <EvidenceReference
                  evidence={beat.evidence}
                  alreadyCited={
                    citedEvidenceKeys?.has(evidenceKey(beat.evidence)) ?? false
                  }
                  onOpenEvidence={onOpenEvidence}
                  className="mt-1.5"
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm leading-6 text-gray-600">
          {beats.length} passaggi che ripercorrono la seduta in ordine, con le
          citazioni da cui derivano.
        </p>
      )}
    </Surface>
  );
}

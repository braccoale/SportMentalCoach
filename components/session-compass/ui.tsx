'use client';

import { ArrowRight, MessageSquareQuote } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CompassEvidence } from '@/lib/core/ai-session-notes/session-compass-contract';
import { formatTranscriptTimestamp } from './time';

/**
 * Primitive condivise della dashboard Riepilogo sessione. Vivono qui, e non
 * dentro una singola sezione, così le card possono avere pesi visivi diversi
 * senza duplicare bordi, ombre e spaziature.
 */

export type SurfaceTone = 'plain' | 'accent' | 'muted';

/**
 * I bordi erano tutti allo stesso peso e con un'ombra appena percepibile:
 * quindici riquadri identici che si contendevano l'attenzione. Il bordo qui
 * serve a delimitare, non a farsi notare, quindi si alleggerisce; l'ombra
 * spariva comunque alla vista e restava solo come rumore.
 */
const SURFACE_TONES: Record<SurfaceTone, string> = {
  plain: 'border-gray-200/70 bg-white',
  accent: 'border-violet-200/80 bg-gradient-to-br from-white via-white to-violet-50/70',
  muted: 'border-gray-200/60 bg-gray-50/60',
};

export function Surface({
  children,
  className = '',
  tone = 'plain',
  as: Tag = 'section',
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  tone?: SurfaceTone;
  as?: 'section' | 'article' | 'div' | 'aside';
  ariaLabel?: string;
}) {
  return (
    <Tag
      aria-label={ariaLabel}
      className={`min-w-0 max-w-full rounded-2xl border p-5 ${SURFACE_TONES[tone]} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className = '',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      {eyebrow ? (
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
          {eyebrow}
        </p>
      ) : null}
      <h3 className={`${eyebrow ? 'mt-1' : ''} text-base font-bold text-gray-950`}>{title}</h3>
      {description ? <p className="mt-1 text-sm leading-6 text-gray-600">{description}</p> : null}
    </div>
  );
}

export function evidenceLabel(evidence: CompassEvidence): string {
  const source = evidence.speaker === 'athlete' ? 'Dichiarazione atleta' : 'Passaggio del coach';
  return `${source} · ${formatTranscriptTimestamp(evidence.startMs)}`;
}

export function evidenceKey(evidence: CompassEvidence): string {
  return `${evidence.transcriptSegmentId}:${evidence.startMs}`;
}

export function EvidenceButton({
  evidence,
  onOpenEvidence,
  className = 'mt-3',
}: {
  evidence: CompassEvidence;
  onOpenEvidence?: (segmentId: number) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${className} group flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-xs text-gray-600 transition hover:border-violet-300 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500`}
      onClick={() => onOpenEvidence?.(evidence.transcriptSegmentId)}
      aria-label={`${evidenceLabel(evidence)}: vai al punto della trascrizione`}
    >
      <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-gray-800">{evidenceLabel(evidence)}</span>
        <span className="mt-1 block line-clamp-2 italic">«{evidence.quote}»</span>
      </span>
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-violet-600" />
    </button>
  );
}

/**
 * Riferimento compatto: sostituisce la ripetizione integrale dell'estratto
 * quando la stessa evidenza è già citata per esteso altrove nella pagina.
 */
export function EvidenceReference({
  evidence,
  alreadyCited = false,
  onOpenEvidence,
  className = 'mt-3',
}: {
  evidence: CompassEvidence;
  alreadyCited?: boolean;
  onOpenEvidence: (segmentId: number) => void;
  className?: string;
}) {
  const timestamp = formatTranscriptTimestamp(evidence.startMs);
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${className}`}
      onClick={() => onOpenEvidence(evidence.transcriptSegmentId)}
      aria-label={`${alreadyCited ? 'Già citata nelle evidenze principali' : 'Vai al passaggio'} a ${timestamp}`}
    >
      <MessageSquareQuote className="h-4 w-4" />
      {alreadyCited ? `Già citata · ${timestamp}` : `Vai al passaggio · ${timestamp}`}
    </button>
  );
}

/** Stato vuoto compatto: non occupa lo spazio di una card piena. */
export function DashboardEmptyState({
  icon,
  title,
  description,
  className = '',
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-gray-300 bg-gray-50/70 p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        {icon ? <span className="mt-0.5 shrink-0 text-violet-600">{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-950">{title}</p>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-gray-600">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'violet' | 'emerald' | 'amber' | 'sky';
}) {
  const tones = {
    neutral: 'bg-gray-100 text-gray-700',
    violet: 'bg-violet-100 text-violet-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-900',
    sky: 'bg-sky-100 text-sky-900',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  CircleCheck,
  Clock,
  XCircle,
  MessageSquare,
  Target,
  CalendarDays,
  AlignLeft,
  FileCheck2,
  LoaderCircle,
  Mic2,
  MoreHorizontal,
  TriangleAlert,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AiSessionArchiveIndicator } from '@/lib/core/ai-session-notes/archive-indicator';

type Tone = 'green' | 'amber' | 'red' | 'gray';

export type CompletedSessionData = {
  id: number;
  status: string;
  /** Small eyebrow over the name in the photo panel, e.g. "Percorso completato". */
  eyebrow: string;
  /** Header label, e.g. "Sessione completata" / "Richiesta scaduta". */
  headerLabel: string;
  statusLabel: string;
  tone: Tone;
  /** Counterpart shown on the card: the athlete (coach view) or the coach (athlete view). */
  personName: string;
  personAvatarUrl: string | null;
  personMeta?: string | null;
  /** Big-date hero. Completed sessions carry the range + duration; other states
   *  show the scheduled date/time (with an optional lead like "Era prevista"). */
  date: {
    day: string;
    monthYear: string;
    startTime: string;
    endTime: string | null;
    durationLabel: string | null;
    /** Small label above the hero for non-session states, e.g. "Era prevista". */
    lead?: string | null;
  } | null;
  primaryNeed: string;
  goal?: string | null;
  /** Bottom one-liner: the request→session timeline (completed) or a status reason. */
  timeline?: { requestedValue: string; sessionValue: string } | null;
  note?: string | null;
  requestedAtLabel: string;
  aiIndicator?: AiSessionArchiveIndicator | null;
};

const TONE: Record<Tone, { text: string; icon: LucideIcon; hover: string }> = {
  green: { text: 'text-emerald-600', icon: CircleCheck, hover: 'hover:border-emerald-200' },
  amber: { text: 'text-amber-600', icon: Clock, hover: 'hover:border-amber-200' },
  red: { text: 'text-red-600', icon: XCircle, hover: 'hover:border-red-200' },
  gray: { text: 'text-gray-500', icon: XCircle, hover: 'hover:border-gray-300' },
};

const AI_INDICATOR: Record<
  AiSessionArchiveIndicator['state'],
  { icon: LucideIcon; className: string; animate?: boolean }
> = {
  recording: {
    icon: Mic2,
    className: 'bg-red-50 text-red-700 ring-red-100',
  },
  processing: {
    icon: LoaderCircle,
    className: 'bg-blue-50 text-blue-700 ring-blue-100',
    animate: true,
  },
  transcript_ready: {
    icon: FileCheck2,
    className: 'bg-blue-50 text-blue-700 ring-blue-100',
  },
  report_processing: {
    icon: LoaderCircle,
    className: 'bg-violet-50 text-violet-700 ring-violet-100',
    animate: true,
  },
  ready: {
    icon: FileCheck2,
    className: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
  approved: {
    icon: FileCheck2,
    className: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  },
  shared: {
    icon: FileCheck2,
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  failed: {
    icon: TriangleAlert,
    className: 'bg-amber-50 text-amber-800 ring-amber-100',
  },
};

/**
 * Compact history card used across the coach/athlete archive for every closed
 * state. Completed sessions get the date range + duration + request→session
 * timeline; other states (expired, declined, cancelled) show the status header
 * and a one-line date note. Consistent shell so the whole archive reads as one.
 */
export function CompletedSessionCard({
  data,
  overflowActions,
  detailContent,
  className,
}: {
  data: CompletedSessionData;
  overflowActions?: ReactNode;
  detailContent?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tone = TONE[data.tone];
  const HeaderIcon = tone.icon;
  const aiIndicator = data.aiIndicator
    ? AI_INDICATOR[data.aiIndicator.state]
    : null;
  const AiIndicatorIcon = aiIndicator?.icon;

  // Le card arrivano da un Server Component: mentre il backend elabora,
  // aggiorna i dati senza costringere il coach a ricaricare la dashboard.
  // Il timer sparisce automaticamente appena lo stato diventa definitivo.
  useEffect(() => {
    const state = data.aiIndicator?.state;
    if (!state || !['recording', 'processing', 'report_processing'].includes(state)) return;
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [data.aiIndicator?.state, router]);

  return (
    <article
      className={cn(
        'flex overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.03] transition',
        tone.hover,
        className
      )}
    >
      {/* Photo panel — image absolutely positioned so it never inflates height. */}
      <div className="relative hidden w-[30%] shrink-0 overflow-hidden bg-gray-900 sm:block">
        {data.personAvatarUrl ? (
          <img
            src={data.personAvatarUrl}
            alt={data.personName}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <img
            src="/logo-transparent-clean.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-[12%_center]"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
            {data.eyebrow}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">
            {data.personName}
          </p>
          {data.personMeta && (
            <p className="truncate text-xs text-white/60">{data.personMeta}</p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn('inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]', tone.text)}>
            <HeaderIcon className="h-4 w-4" />
            {data.headerLabel}
          </span>
          {data.aiIndicator && aiIndicator && AiIndicatorIcon && (
            <span
              className={cn(
                'ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset',
                aiIndicator.className
              )}
            >
              <AiIndicatorIcon
                className={cn('h-3.5 w-3.5 shrink-0', aiIndicator.animate && 'animate-spin')}
              />
              {data.aiIndicator.label}
            </span>
          )}
        </div>

        <div className="min-h-[52px]">
          {data.date ? (
            <>
              {data.date.lead && (
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
                  {data.date.lead}
                </p>
              )}
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold leading-none tracking-tighter text-gray-950">
                  {data.date.day}
                </span>
                <div className="leading-tight">
                  <span className="text-sm font-bold uppercase tracking-tight text-gray-700">
                    {data.date.monthYear}
                  </span>
                  <span className="ml-1.5 text-lg font-bold tracking-tight text-gray-950">
                    {data.date.startTime}
                    {data.date.endTime ? ` — ${data.date.endTime}` : ''}
                  </span>
                  {data.date.durationLabel && (
                    <span className="ml-1.5 text-xs text-gray-500">
                      · {data.date.durationLabel}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">Data non definita</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-2.5 text-sm">
          <div className="flex items-start gap-2">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="text-gray-700">
              <span className="text-gray-400">Bisogno: </span>
              {data.primaryNeed}
            </span>
          </div>
          {data.goal && (
            <div className="flex items-start gap-2">
              <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="text-gray-700">
                <span className="text-gray-400">Obiettivo: </span>
                {data.goal}
              </span>
            </div>
          )}
        </div>

        <p className="min-h-[16px] text-xs text-gray-500">
          {data.timeline
            ? `Richiesta ${data.timeline.requestedValue} · svolta ${data.timeline.sessionValue}`
            : (data.note ?? '')}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-100 pt-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-gray-500">
            <CalendarDays className="h-3.5 w-3.5" /> Ricevuta {data.requestedAtLabel}
          </span>

          <div className="flex items-center gap-1">
            {detailContent && (
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
              >
                {detailsOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <AlignLeft className="h-3.5 w-3.5" />
                )}
                Dettagli
              </button>
            )}
            {overflowActions && (
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="flex flex-col gap-1">
                  {overflowActions}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {detailsOpen && detailContent && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
            {detailContent}
          </div>
        )}
      </div>
    </article>
  );
}

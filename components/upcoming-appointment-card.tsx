'use client';

import { ShareButton } from '@/components/share-button';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Video,
  MessageSquare,
  CalendarCheck,
  AlignLeft,
  MoreHorizontal,
  ChevronUp,
  CircleCheck,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type UpcomingAppointmentData = {
  id: number;
  /** Counterpart shown on the card: the athlete (coach view) or the coach (athlete view). */
  athleteName: string;
  athleteAvatarUrl: string | null;
  eyebrow: string;
  statusLabel: string;
  /** Huge-date hero; null when there's no fixed time yet. */
  date: { day: string; monthYear: string; time: string } | null;
  primaryNeed: string;
  completionHint: string;
  requestedAtLabel: string;
};

/**
 * "Prossimi appuntamenti" card: a portrait photo panel on the left with the
 * athlete + status overlaid, and a right panel led by a huge date hero. A
 * dedicated design for the coach's accepted-sessions section — distinct from
 * the more compact `CoachRequestCard` used for pending requests and archive.
 */
export function UpcomingAppointmentCard({
  data,
  primaryActions,
  overflowActions,
  detailContent,
  isCoachView,
  className,
}: {
  data: UpcomingAppointmentData;
  primaryActions?: ReactNode;
  overflowActions?: ReactNode;
  detailContent?: ReactNode;
  isCoachView?: boolean;
  className?: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <article
      className={cn(
        'flex overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.03] transition hover:border-red-200 hover:shadow-md',
        className
      )}
    >
      {/* Photo panel — the image is absolutely positioned so its own
          (potentially tall/portrait) aspect ratio never inflates the row's
          height; the card's height is driven by the content column only. */}
      <div className="relative hidden w-[38%] shrink-0 overflow-hidden bg-gray-900 sm:block">
        {data.athleteAvatarUrl ? (
          <img
            src={data.athleteAvatarUrl}
            alt={data.athleteName}
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
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
            {data.eyebrow}
          </p>
          <p className="mt-0.5 truncate text-base font-semibold text-white">
            {data.athleteName}
          </p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-400/30 backdrop-blur">
            <CircleCheck className="h-3.5 w-3.5" />
            {data.statusLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-emerald-600">
            <Video className="h-4 w-4" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">
            Sessione online
          </span>
        </div>

        <div className="mt-2">
          {data.date ? (
            <div className="flex items-stretch gap-2">
              {/* Giorno, mese e anno in blu: è la data a doversi leggere per
                  prima, e il blu la stacca dall'orario senza aggiungere peso. */}
              <span className="text-7xl font-bold leading-none tracking-tighter text-blue-800">
                {data.date.day}
              </span>
              <div className="flex flex-col justify-between py-0.5">
                <span className="text-lg font-bold uppercase tracking-tight text-blue-800">
                  {data.date.monthYear}
                </span>
                <span className="text-4xl font-bold leading-none tracking-tight text-gray-950">
                  {data.date.time}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-lg font-medium text-gray-500">
              Orario da concordare
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-sm text-gray-700">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500">
              <MessageSquare className="h-3.5 w-3.5" />
            </span>
            <span className="line-clamp-1">{data.primaryNeed}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500">
              <Video className="h-3.5 w-3.5" />
            </span>
            <span className="line-clamp-1">{data.completionHint}</span>
          </div>
        </div>

        {primaryActions && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
            {primaryActions}
            {/* Aggiunto il pulsante di condivisione, visibile solo per il coach */}
            {isCoachView && <ShareButton bookingId={data.id} />}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm">
          <span className="flex items-center gap-2 text-gray-500">
            <CalendarCheck className="h-4 w-4" /> Ricevuta {data.requestedAtLabel}
          </span>

          <div className="flex items-center gap-1">
            {detailContent && (
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="flex items-center gap-1.5 font-medium text-gray-700 hover:text-gray-950"
              >
                {detailsOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <AlignLeft className="h-4 w-4" />
                )}
                Vedi dettagli
              </button>
            )}
            {overflowActions && (
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <MoreHorizontal className="h-5 w-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="flex flex-col gap-1">
                  {overflowActions}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {detailsOpen && detailContent && (
          <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
            {detailContent}
          </div>
        )}
      </div>
    </article>
  );
}

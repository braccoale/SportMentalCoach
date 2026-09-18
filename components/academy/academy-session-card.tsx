'use client';

import Link from 'next/link';
import { Video, Users2, BookOpen, UserRound, CircleCheck, FileText, X } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { AddToGoogleCalendarButton } from '@/components/add-to-google-calendar-button';
import { AcademyVideoCallButton } from '@/components/academy/academy-video-call-button';
import { buildGoogleCalendarUrl } from '@/lib/core/google-calendar';
import { cn } from '@/lib/utils';
import type { ActionState } from '@/lib/auth/middleware';

export type AcademySessionCardData = {
  id: number;
  courseId: number;
  courseTitle: string;
  moduleTitle: string;
  instructorName: string;
  instructorAvatarUrl: string | null;
  description: string | null;
  scheduledFor: Date;
  durationMin: number;
  participantCount: number;
  /** Solo il docente (o l'admin) può annullare — mai il partecipante. */
  canCancel: boolean;
};

function formatDateParts(scheduledFor: Date, durationMin: number) {
  const dayFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', timeZone: 'Europe/Rome' });
  const monthYearFmt = new Intl.DateTimeFormat('it-IT', {
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  });
  const weekdayFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long', timeZone: 'Europe/Rome' });
  const timeFmt = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  });
  const end = new Date(scheduledFor.getTime() + durationMin * 60_000);

  return {
    day: dayFmt.format(scheduledFor),
    monthYear: monthYearFmt.format(scheduledFor).replace('.', ''),
    weekday: weekdayFmt.format(scheduledFor),
    time: `${timeFmt.format(scheduledFor)} – ${timeFmt.format(end)}`,
  };
}

/**
 * Card "prossima sessione Academy" per la dashboard — stessa famiglia
 * visiva di `UpcomingAppointmentCard` (pannello foto a sinistra, data
 * enorme a destra), ma riconoscibile come Academy: branding KaiPai al
 * posto della foto dell'atleta, pill "Sessione formativa" invece di
 * "Sessione online", righe Docente/Modulo/Partecipanti al posto dei dati
 * di prenotazione. "Entra in chiamata" apre `/dashboard/video/academy/[id]`
 * — stesso motore LiveKit della videochiamata coach-atleta, stanza propria.
 */
export function AcademySessionCard({
  data,
  cancelSessionAction,
  compact = false,
}: {
  data: AcademySessionCardData;
  cancelSessionAction?: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Riga più bassa e tipografia ridotta — per una sezione dashboard con più card impilate. */
  compact?: boolean;
}) {
  const date = formatDateParts(data.scheduledFor, data.durationMin);
  const courseHref = `/dashboard/coach/academy/${data.courseId}`;
  const googleCalendarUrl = buildGoogleCalendarUrl({
    title: `${data.moduleTitle} — ${data.courseTitle}`,
    startAt: data.scheduledFor,
    endAt: new Date(data.scheduledFor.getTime() + data.durationMin * 60_000),
    description: data.description ?? `Sessione Academy del corso ${data.courseTitle}, con ${data.instructorName}.`,
    timezone: 'Europe/Rome',
  });

  return (
    <article
      className={cn(
        'flex overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.03] transition hover:border-blue-200 hover:shadow-md'
      )}
    >
      <div
        className={cn(
          'relative hidden shrink-0 overflow-hidden bg-blue-950 sm:block',
          compact ? 'w-[26%]' : 'w-[38%]'
        )}
        style={{
          backgroundImage: 'url(/academy/session-card-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'left center',
        }}
      >
        {/* Logo, wordmark, parole chiave e citazione sono già nell'immagine
            di brand (decorazione Academy generica, non una foto del
            docente reale) — qui si aggiunge solo il dato vero: chi tiene
            questa sessione. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-blue-950/95 to-transparent" />
        <div className={cn('absolute inset-x-0 bottom-0', compact ? 'p-3' : 'p-4')}>
          {!compact && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
              Docente
            </p>
          )}
          <p
            className={cn(
              'mt-0.5 truncate font-semibold text-white',
              compact ? 'text-xs' : 'text-base'
            )}
          >
            {data.instructorName}
          </p>
        </div>
      </div>

      <div className={cn('flex flex-1 flex-col', compact ? 'p-3' : 'p-4')}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex shrink-0 items-center justify-center rounded-lg border border-gray-200 text-blue-700',
                compact ? 'h-6 w-6' : 'h-8 w-8'
              )}
            >
              <Video className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            </span>
            <span
              className={cn(
                'font-semibold uppercase tracking-[0.14em] text-blue-700',
                compact ? 'text-[10px]' : 'text-xs'
              )}
            >
              Sessione formativa
            </span>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200',
              compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
            )}
          >
            <CircleCheck className="h-3.5 w-3.5" />
            Confermata
          </span>
        </div>

        <div className={compact ? 'mt-1.5' : 'mt-2'}>
          <div className="flex items-stretch gap-2">
            <span
              className={cn(
                'font-bold leading-none tracking-tighter text-blue-800',
                compact ? 'text-4xl' : 'text-7xl'
              )}
            >
              {date.day}
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
              <div className="flex min-w-0 items-baseline gap-2 text-blue-800">
                <span
                  className={cn(
                    'font-bold uppercase tracking-tight',
                    compact ? 'text-sm' : 'text-lg'
                  )}
                >
                  {date.monthYear}
                </span>
                <span className="truncate text-xs font-semibold capitalize">{date.weekday}</span>
              </div>
              <span
                className={cn(
                  'font-bold leading-none tracking-tight text-gray-950',
                  compact ? 'text-xl' : 'text-3xl'
                )}
              >
                {date.time}
              </span>
            </div>
          </div>
        </div>

        <div className={compact ? 'mt-1.5' : 'mt-2'}>
          <p className={cn('font-semibold text-gray-900', compact ? 'text-sm' : 'text-base')}>
            {data.moduleTitle}
          </p>
          {!compact && (
            <p className="mt-0.5 text-sm text-gray-500">{data.description || data.courseTitle}</p>
          )}
        </div>

        {!compact && (
          <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-sm text-gray-700">
            <div className="flex items-center gap-2.5">
              {data.instructorAvatarUrl ? (
                <img
                  src={data.instructorAvatarUrl}
                  alt={data.instructorName}
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500">
                  <UserRound className="h-3.5 w-3.5" />
                </span>
              )}
              Docente <span className="font-medium text-gray-900">{data.instructorName}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500">
                <BookOpen className="h-3.5 w-3.5" />
              </span>
              Modulo del corso <span className="font-medium text-gray-900">{data.moduleTitle}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500">
                <Users2 className="h-3.5 w-3.5" />
              </span>
              Partecipanti{' '}
              <span className="font-medium text-gray-900">
                {data.participantCount} coach iscritt{data.participantCount === 1 ? 'o' : 'i'}
              </span>
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3',
            compact ? 'mt-2' : 'mt-3'
          )}
        >
          <AcademyVideoCallButton
            sessionId={data.id}
            scheduledFor={data.scheduledFor.toISOString()}
            durationMin={data.durationMin}
            compact={compact}
          />
          <Link
            href={`${courseHref}?tab=materiali`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-gray-200 font-medium text-gray-700 hover:bg-gray-50',
              compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
            )}
          >
            <FileText className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
            Materiali
          </Link>
          <Link
            href={courseHref}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-gray-200 font-medium text-gray-700 hover:bg-gray-50',
              compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
            )}
          >
            Apri corso
          </Link>
          <AddToGoogleCalendarButton
            url={googleCalendarUrl}
            uiSource="appointment_card"
            userRole="coach"
            compact
          />
          {data.canCancel && cancelSessionAction && (
            <ActionForm
              action={cancelSessionAction}
              confirmTitle="Annullare la sessione?"
              confirmMessage="I partecipanti non potranno più entrare in questa sessione."
              confirmActionLabel="Annulla"
              className="ml-auto"
            >
              <input type="hidden" name="sessionId" value={data.id} />
              <input type="hidden" name="courseId" value={data.courseId} />
              <button
                type="submit"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border border-red-200 font-medium text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700',
                  compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
                )}
              >
                <X className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
                Annulla
              </button>
            </ActionForm>
          )}
        </div>
      </div>
    </article>
  );
}

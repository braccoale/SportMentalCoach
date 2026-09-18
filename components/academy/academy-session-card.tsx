'use client';

import Link from 'next/link';
import { Video, Users2, BookOpen, UserRound, CircleCheck, FileText, X } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { AddToGoogleCalendarButton } from '@/components/add-to-google-calendar-button';
import { buildGoogleCalendarUrl } from '@/lib/core/google-calendar';
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
 * di prenotazione. Nessun pulsante "Partecipa": la videochiamata Academy
 * non esiste ancora, mostrarne uno sarebbe un affordance rotto.
 */
export function AcademySessionCard({
  data,
  cancelSessionAction,
}: {
  data: AcademySessionCardData;
  cancelSessionAction?: (state: ActionState, formData: FormData) => Promise<ActionState>;
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
    <article className="flex overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.03] transition hover:border-blue-200 hover:shadow-md">
      <div
        className="relative hidden w-[38%] shrink-0 overflow-hidden bg-blue-950 sm:block"
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-blue-950/95 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">Docente</p>
          <p className="mt-0.5 truncate text-base font-semibold text-white">{data.instructorName}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-blue-700">
              <Video className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
              Sessione formativa
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <CircleCheck className="h-3.5 w-3.5" />
            Confermata
          </span>
        </div>

        <div className="mt-2">
          <div className="flex items-stretch gap-2">
            <span className="text-7xl font-bold leading-none tracking-tighter text-blue-800">
              {date.day}
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
              <div className="flex min-w-0 items-baseline gap-2 text-blue-800">
                <span className="text-lg font-bold uppercase tracking-tight">{date.monthYear}</span>
                <span className="truncate text-sm font-semibold capitalize">{date.weekday}</span>
              </div>
              <span className="text-3xl font-bold leading-none tracking-tight text-gray-950">
                {date.time}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-2">
          <p className="text-base font-semibold text-gray-900">{data.moduleTitle}</p>
          <p className="mt-0.5 text-sm text-gray-500">
            {data.description || data.courseTitle}
          </p>
        </div>

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

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
          <Link
            href={`${courseHref}?tab=materiali`}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Materiali del modulo
          </Link>
          <Link
            href={courseHref}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Annulla
              </button>
            </ActionForm>
          )}
        </div>
      </div>
    </article>
  );
}

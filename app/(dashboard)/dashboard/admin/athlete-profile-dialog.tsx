'use client';

import { DemoBadge } from '@/components/demo-badge';
import { useId, useRef } from 'react';
import {
  Cake,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Clock3,
  Mail,
  MapPin,
  Medal,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import { CoachAvatar } from '@/components/coach-visuals';
import {
  GaugeRing,
  gaugeProgress,
} from '@/components/coach-experience-stats';
import { Button } from '@/components/ui/button';

export type AthleteProfileDialogData = {
  name: string;
  email: string;
  /** Conto di dimostrazione: va detto accanto al nome, non nascosto. */
  isDemo: boolean;
  avatarUrl: string | null;
  sport: string | null;
  level: string | null;
  city: string | null;
  birthDate: string | null;
  goals: string | null;
  completedSessions: number;
  scheduledSessions: number;
  totalMinutes: number;
  registeredAt: string;
};

function ProfileField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Trophy;
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Icon className="h-4 w-4" />
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-medium text-gray-900">
        {value || 'Non indicato'}
      </dd>
    </div>
  );
}

function AthleteActivityStats({
  completedSessions,
  scheduledSessions,
  totalMinutes,
}: {
  completedSessions: number;
  scheduledSessions: number;
  totalMinutes: number;
}) {
  const numberFormat = new Intl.NumberFormat('it-IT');

  return (
    <section className="relative mt-5 overflow-hidden rounded-2xl border border-green-100 bg-gradient-to-br from-green-50 via-white to-sky-50 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-green-200/40 blur-3xl"
      />
      <div className="relative">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Attività su KaiPai
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Sessioni completate, in programma e minuti già svolti.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
          <div className="flex flex-col items-center rounded-2xl border border-white/80 bg-white/70 p-3 text-center shadow-sm">
            <div className="relative flex h-[88px] w-[88px] items-center justify-center">
              <GaugeRing
                progress={gaugeProgress(completedSessions, 10)}
                className="stroke-green-500"
                size={88}
              />
              <div className="absolute flex flex-col items-center">
                <CalendarCheck2 className="h-4 w-4 text-green-600" />
                <span className="mt-0.5 text-xl font-bold text-gray-950">
                  {numberFormat.format(completedSessions)}
                </span>
              </div>
            </div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Sessioni completate
            </p>
          </div>

          <div className="flex flex-col items-center rounded-2xl border border-white/80 bg-white/70 p-3 text-center shadow-sm">
            <div className="relative flex h-[88px] w-[88px] items-center justify-center">
              <GaugeRing
                progress={gaugeProgress(scheduledSessions, 10)}
                className="stroke-amber-500"
                size={88}
              />
              <div className="absolute flex flex-col items-center">
                <CalendarClock className="h-4 w-4 text-amber-600" />
                <span className="mt-0.5 text-xl font-bold text-gray-950">
                  {numberFormat.format(scheduledSessions)}
                </span>
              </div>
            </div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Sessioni pianificate
            </p>
          </div>

          <div className="flex flex-col items-center rounded-2xl border border-white/80 bg-white/70 p-3 text-center shadow-sm">
            <div className="relative flex h-[88px] w-[88px] items-center justify-center">
              <GaugeRing
                progress={gaugeProgress(totalMinutes, 600)}
                className="stroke-sky-500"
                size={88}
              />
              <div className="absolute flex flex-col items-center">
                <Clock3 className="h-4 w-4 text-sky-600" />
                <span className="mt-0.5 text-lg font-bold text-gray-950">
                  {numberFormat.format(totalMinutes)}
                </span>
                <span className="text-[10px] font-medium text-gray-500">
                  min
                </span>
              </div>
            </div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Minuti totali
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AthleteProfileDialog({
  athlete,
}: {
  athlete: AthleteProfileDialogData;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const meta = [athlete.sport, athlete.level, athlete.city]
    .filter(Boolean)
    .join(' · ');

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="flex h-full min-h-28 w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-green-300 hover:bg-green-50/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        aria-haspopup="dialog"
        aria-label={`Apri la scheda atleta di ${athlete.name}`}
      >
        <CoachAvatar
          name={athlete.name}
          src={athlete.avatarUrl}
          className="size-14 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-gray-900">
              {athlete.name}
            </span>
            {athlete.isDemo && <DemoBadge />}
          </span>
          <span className="block truncate text-sm text-gray-500">
            {athlete.email}
          </span>
          {meta && (
            <span className="block truncate text-xs text-gray-400">{meta}</span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-2 text-xs text-gray-400">
          <span>Iscritto il {athlete.registeredAt}</span>
          <span className="inline-flex items-center gap-1 font-medium text-green-700">
            Vedi scheda
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/50"
      >
        <div className="relative">
          <button
            type="button"
            onClick={closeDialog}
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            aria-label="Chiudi scheda atleta"
          >
            <X className="h-4 w-4" />
          </button>

          <header className="flex flex-col items-center gap-4 border-b border-gray-100 bg-gradient-to-b from-green-50 to-white px-6 pb-6 pt-8 text-center sm:flex-row sm:text-left">
            <CoachAvatar
              name={athlete.name}
              src={athlete.avatarUrl}
              className="size-24 shrink-0 text-2xl sm:size-28"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-green-700">
                Scheda atleta
              </p>
              <h2
                id={titleId}
                className="mt-1 break-words text-2xl font-bold tracking-tight text-gray-950"
              >
                {athlete.name}
                {athlete.isDemo && <DemoBadge className="ml-2 align-middle" />}
              </h2>
              <p className="mt-1 flex items-center justify-center gap-2 break-all text-sm text-gray-600 sm:justify-start">
                <Mail className="h-4 w-4 shrink-0" />
                {athlete.email}
              </p>
            </div>
          </header>

          <div className="p-6">
            <dl className="grid gap-3 sm:grid-cols-2">
              <ProfileField icon={Trophy} label="Sport" value={athlete.sport} />
              <ProfileField icon={Medal} label="Livello" value={athlete.level} />
              <ProfileField icon={MapPin} label="Città" value={athlete.city} />
              <ProfileField
                icon={Cake}
                label="Data di nascita"
                value={athlete.birthDate}
              />
              <ProfileField
                icon={CalendarDays}
                label="Iscrizione"
                value={athlete.registeredAt}
              />
              <ProfileField
                icon={Target}
                label="Obiettivo sportivo"
                value={athlete.goals}
              />
            </dl>

            <AthleteActivityStats
              completedSessions={athlete.completedSessions}
              scheduledSessions={athlete.scheduledSessions}
              totalMinutes={athlete.totalMinutes}
            />

            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
                className="rounded-full"
              >
                Chiudi
              </Button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

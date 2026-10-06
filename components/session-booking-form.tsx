'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Loader2,
  Lock,
} from 'lucide-react';
import { CoachAvatar } from '@/components/coach-visuals';
import { ProductTour } from '@/components/product-tour';
import { DEMO_READONLY_MESSAGE } from '@/lib/auth/demo-readonly';
import { requestBooking } from '@/app/(marketplace)/coaches/[slug]/actions';
import type { ActionState } from '@/lib/auth/middleware';
import type { BookableDay } from '@/lib/core/availability';
import {
  isStartBusyForDuration,
  slotPresentation,
} from '@/lib/core/availability/validation';
import {
  DEFAULT_SESSION_DURATION_MIN,
  largestFittingDuration,
} from '@/lib/core/bookings/duration';
import { formatLongDateRome } from '@/lib/core/billing/subscription-status';
import { cn } from '@/lib/utils';

const DAYS_PER_PAGE = 7;
const NOTE_MAX = 500;
const INTRO_DURATION_MIN = 20;

type ServiceOption = {
  id: number;
  title: string | null;
  durationMin: number | null;
};

function firstFreeTime(day: BookableDay | undefined, durationMin: number | null): string {
  return (
    day?.times.find((time) => !isStartBusyForDuration(day.maxDurationMin, time, durationMin)) ?? ''
  );
}

/** Il giorno si legge a mezzogiorno di Roma, mai nel fuso del dispositivo. */
function atNoon(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function dayChip(value: string): { weekday: string; number: string } {
  const at = atNoon(value);
  return {
    weekday: new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'short' }).format(at),
    number: new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric' }).format(at),
  };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  return `${String(hh).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * L'unico modulo di prenotazione: giorno, orario, obiettivi e, a destra, il
 * riepilogo. Lo usano la finestra «Prenota una seduta» (con le sedute rimaste),
 * la «Sessione conoscitiva» gratuita e il profilo del coach: stessi campi e
 * stessa azione (`requestBooking`), quindi stessa regola lato server. Si sceglie
 * soltanto tra giorni e orari che il server accetterebbe (le date arrivano già
 * filtrate, anche da `applyBookingCredits`).
 *
 * Si adatta alla larghezza del contenitore, non dello schermo: nel profilo la
 * colonna è stretta anche su un monitor largo.
 */
export function SessionBookingForm({
  slug,
  coachName,
  coachFirstName,
  coachAvatarUrl,
  coachHeadline,
  services,
  bookableDays,
  remaining = null,
  total = null,
  introductory = false,
  isDemo = false,
  tourAlreadySeen = true,
  showTour = false,
  submitLabel,
}: {
  slug: string;
  coachName: string;
  coachFirstName: string;
  coachAvatarUrl: string | null;
  coachHeadline: string | null;
  services: ServiceOption[];
  bookableDays: BookableDay[];
  /** Sedute prenotabili adesso (piano + extra); `null` se non si sa. */
  remaining?: number | null;
  /** Il totale con cui confrontarle (sedute del piano + extra). */
  total?: number | null;
  /** Sessione conoscitiva gratuita: 20 minuti, nessun servizio da scegliere. */
  introductory?: boolean;
  /** Account demo: il server rifiuta comunque la scrittura, qui lo si dice subito. */
  isDemo?: boolean;
  tourAlreadySeen?: boolean;
  /** Mostra il tour guidato del calendario (solo sul profilo). */
  showTour?: boolean;
  /** Il testo del pulsante; se manca, «Conferma la prenotazione». */
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(requestBooking, {
    error: '',
  });

  const primaryService = services[0];
  const baseDurationMin = introductory
    ? INTRO_DURATION_MIN
    : (largestFittingDuration(primaryService?.durationMin ?? DEFAULT_SESSION_DURATION_MIN) ??
      DEFAULT_SESSION_DURATION_MIN);

  const [day, setDay] = useState(bookableDays[0]?.value ?? '');
  const [time, setTime] = useState(firstFreeTime(bookableDays[0], baseDurationMin));
  const [durationMin, setDurationMin] = useState<number>(baseDurationMin);
  const [page, setPage] = useState(0);
  const [note, setNote] = useState('');

  const selectedDay = useMemo(() => bookableDays.find((d) => d.value === day), [bookableDays, day]);
  const pageCount = Math.max(1, Math.ceil(bookableDays.length / DAYS_PER_PAGE));
  const visibleDays = bookableDays.slice(page * DAYS_PER_PAGE, (page + 1) * DAYS_PER_PAGE);
  const scheduledFor = day && time ? `${day}T${time}` : '';

  function chooseDay(next: BookableDay) {
    setDay(next.value);
    const first = firstFreeTime(next, baseDurationMin);
    setTime(first);
    const slot = first
      ? slotPresentation(next.maxDurationMin, first, baseDurationMin, true)
      : null;
    setDurationMin(slot?.fitsDurationMin ?? baseDurationMin);
  }

  function chooseTime(next: string) {
    setTime(next);
    if (!selectedDay) return;
    const slot = slotPresentation(selectedDay.maxDurationMin, next, baseDurationMin, true);
    setDurationMin(slot.fitsDurationMin ?? baseDurationMin);
  }

  if (!introductory && services.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
        Questo coach non ha ancora configurato un servizio con una durata. La
        prenotazione sarà disponibile appena lo completerà.
      </p>
    );
  }

  const monthLabel = day
    ? capitalise(
        new Intl.DateTimeFormat('it-IT', {
          timeZone: 'Europe/Rome',
          month: 'long',
          year: 'numeric',
        }).format(atNoon(day))
      )
    : '';
  const dayLong = day
    ? `${capitalise(
        new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long' }).format(atNoon(day))
      )} ${formatLongDateRome(atNoon(day))}`
    : '';

  return (
    <form action={formAction} className="@container flex flex-col gap-5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="scheduledFor" value={scheduledFor} />
      {introductory ? (
        <input type="hidden" name="introductory" value="true" />
      ) : (
        <>
          <input type="hidden" name="serviceId" value={primaryService?.id ?? ''} />
          <input type="hidden" name="durationMin" value={durationMin} />
        </>
      )}
      {showTour && bookableDays.length > 0 && (
        <ProductTour tourKey="athlete_booking" alreadySeen={tourAlreadySeen} />
      )}

      <div className="grid gap-6 @[46rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Sinistra: giorno e orario */}
        <div className="flex min-w-0 flex-col gap-6">
          {bookableDays.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {coachFirstName} non ha ancora pubblicato la sua disponibilità:
              racconta il tuo obiettivo e concorderete insieme un orario.
            </p>
          ) : (
          <>
          <section aria-labelledby="sb-day" data-tour="athlete-booking-calendar">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="sb-day" className="flex items-center gap-2.5 text-base font-semibold text-gray-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                  1
                </span>
                Seleziona il giorno
              </h3>
              <span className="flex items-center gap-1 text-sm text-gray-500">
                {monthLabel}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  aria-label="Giorni precedenti"
                  className="ml-2 flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  aria-label="Giorni successivi"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1.5 border-b border-gray-100 pb-4">
              {visibleDays.map((d) => {
                const chip = dayChip(d.value);
                const selected = d.value === day;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => chooseDay(d)}
                    aria-pressed={selected}
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs font-medium transition',
                      selected
                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-400 hover:bg-emerald-50'
                    )}
                  >
                    <span className="uppercase opacity-80">{chip.weekday}</span>
                    <span className="text-lg font-bold leading-none">{chip.number}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="sb-time">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="sb-time" className="flex items-center gap-2.5 text-base font-semibold text-gray-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                  2
                </span>
                Seleziona l&apos;orario
              </h3>
              {dayLong && (
                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Clock className="h-4 w-4" aria-hidden />
                  {dayLong}
                </span>
              )}
            </div>
            <div className="mt-3 grid max-h-64 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
              {selectedDay?.times.map((t) => {
                const slot = slotPresentation(selectedDay.maxDurationMin, t, durationMin, true);
                const selected = t === time;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={!slot.selectable}
                    onClick={() => chooseTime(t)}
                    aria-pressed={selected}
                    title={slot.suffix ? slot.suffix.replace(' · ', '') : undefined}
                    className={cn(
                      'rounded-lg border px-2 py-2.5 text-sm font-medium tabular-nums transition',
                      selected
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : slot.tone === 'occupied'
                          ? 'cursor-not-allowed border-gray-100 bg-gray-100 text-gray-300'
                          : slot.tone === 'tight'
                            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400'
                            : 'border-gray-200 bg-white text-gray-900 hover:border-emerald-400 hover:bg-emerald-50'
                    )}
                  >
                    {t}
                  </button>
                );
              })}
              {!selectedDay?.times.length && (
                <p className="col-span-full text-sm text-gray-400">
                  Nessun orario libero questo giorno.
                </p>
              )}
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-gray-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <span>
                Vedi solo i giorni e gli orari in cui {coachFirstName} riceve. Gli
                orari in grigio non sono disponibili. Gli orari sono quelli
                italiani (Europa/Roma).
              </span>
            </p>
          </section>
          </>
          )}
        </div>

        {/* Destra: riepilogo e obiettivi */}
        <aside className="flex min-w-0 flex-col gap-4 rounded-2xl bg-gray-50/80 p-4">
          <div className="flex items-center gap-3">
            <CoachAvatar name={coachName} src={coachAvatarUrl} className="size-12 shrink-0" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">
                {introductory ? 'Sessione conoscitiva con' : 'Seduta con'} {coachFirstName}
              </p>
              {coachHeadline && <p className="truncate text-sm text-gray-500">{coachHeadline}</p>}
            </div>
          </div>

          <div className="rounded-xl bg-emerald-50 p-3.5">
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
              {scheduledFor ? (
                <div className="leading-snug">
                  <p className="font-semibold text-gray-900">{dayLong}</p>
                  <p className="text-sm text-gray-700">
                    dalle {time} alle {addMinutes(time, durationMin)}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                    <Clock className="h-4 w-4" aria-hidden />
                    {durationMin} minuti
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-600">Scegli un giorno e un orario.</p>
              )}
            </div>
          </div>

          {introductory && (
            <p className="rounded-xl bg-white p-3.5 text-sm text-gray-700 shadow-sm">
              <span className="font-semibold text-gray-900">Gratuita · {INTRO_DURATION_MIN} minuti.</span>{' '}
              Per conoscervi e parlare dei tuoi obiettivi, senza impegno.
            </p>
          )}

          {remaining !== null && total !== null && total > 0 && (
            <div className="rounded-xl bg-white p-3.5 shadow-sm">
              <p className="text-sm text-gray-700">Sedute disponibili</p>
              <p className="text-xl font-bold text-gray-900">
                {remaining} <span className="text-base font-medium text-gray-500">su {total}</span>
              </p>
              <span aria-hidden className="mt-2 flex gap-1">
                {Array.from({ length: Math.min(total, 12) }, (_, i) => (
                  <span
                    key={i}
                    className={cn('h-2 flex-1 rounded-full', i < remaining ? 'bg-emerald-600' : 'bg-gray-200')}
                  />
                ))}
              </span>
            </div>
          )}

          <div className="flex flex-col">
            <label htmlFor="sb-note" className="font-semibold text-gray-900">
              Raccontami i tuoi obiettivi
            </label>
            <p className="mt-0.5 text-sm text-gray-500">
              Così {coachFirstName} potrà preparare al meglio la sessione.
            </p>
            <textarea
              id="sb-note"
              name="note"
              rows={5}
              maxLength={NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              placeholder="Es. Gestire l’ansia prima della partita, migliorare la concentrazione…"
            />
            <span className="mt-1 text-right text-xs text-gray-500">
              {note.length}/{NOTE_MAX}
            </span>
          </div>
        </aside>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {isDemo && <p className="text-sm text-gray-500">{DEMO_READONLY_MESSAGE}</p>}

      <div className="flex flex-col items-center gap-2 border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={isDemo || pending || (bookableDays.length > 0 && !scheduledFor)}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 text-base font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Invio…
            </>
          ) : (
            <>
              <CalendarDays className="h-5 w-5" aria-hidden />
              {submitLabel ?? 'Conferma la prenotazione'}
              <ArrowRight className="h-5 w-5" aria-hidden />
            </>
          )}
        </button>
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {coachFirstName} conferma la richiesta e ricevi una notifica.
        </p>
      </div>
    </form>
  );
}

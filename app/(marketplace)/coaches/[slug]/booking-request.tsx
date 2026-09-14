'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestBooking } from './actions';
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
import { DEMO_READONLY_MESSAGE } from '@/lib/auth/demo-readonly';

type ServiceOption = {
  id: number;
  title: string | null;
  durationMin: number | null;
};

const fieldCls =
  'mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';

const FORM_ID = 'booking-request-form';

function firstFreeTime(
  day: BookableDay | undefined,
  durationMin: number | null
): string {
  return (
    day?.times.find(
      (time) => !isStartBusyForDuration(day.maxDurationMin, time, durationMin)
    ) ?? ''
  );
}

/** "16 set" — read from the "YYYY-MM-DD" value at Rome noon, never device time. */
function dayChip(value: string): { weekday: string; number: string } {
  const at = new Date(`${value}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      weekday: 'short',
    }).format(at),
    number: new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      day: 'numeric',
    }).format(at),
  };
}

/**
 * Booking request form. When the coach has published availability, the "when"
 * field is a constrained day + time picker built from `bookableDays` — the
 * athlete can only choose days/hours the coach actually works. With no
 * availability configured it degrades to a plain "da concordare" note.
 */
export function BookingRequest({
  slug,
  coachFirstName,
  services,
  bookableDays,
  introductory = false,
  isDemo = false,
}: {
  slug: string;
  coachFirstName: string;
  services: ServiceOption[];
  bookableDays: BookableDay[];
  /**
   * Dal riquadro "Sessione conoscitiva (gratis)": niente servizio da scegliere
   * (il coach può non averne ancora uno-intro, lo risolve il server) e
   * durata fissa a 20 minuti, non un valore fra cui scegliere.
   */
  introductory?: boolean;
  /** Account demo: il server rifiuta comunque la scrittura (readonly), il
   * submit disabilitato lo dice subito invece di far scoprire il blocco
   * dopo l'invio del form. */
  isDemo?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestBooking,
    { error: '' }
  );

  const introDurationMin = 20;
  /**
   * Niente più selettore servizio/durata: il coach ne ha di norma uno solo
   * (quello che definisce il suo compenso), quindi si usa direttamente
   * quello invece di far scegliere all'atleta qualcosa che non varia mai
   * nella pratica. `services[0]` — non `find`, l'ordine è già "il servizio
   * principale prima" dal caricamento — resta la durata di riferimento
   * anche per gli orari "stretti" più sotto.
   */
  const primaryService = services[0];
  /**
   * `durationMin` sulla prenotazione resta l'insieme chiuso di
   * SESSION_DURATION_OPTIONS (10-60): la durata del servizio può essere
   * qualunque valore il coach abbia impostato, `largestFittingDuration`
   * la porta alla più vicina opzione valida senza superarla — lo stesso
   * limite che c'era già quando la durata la sceglieva l'atleta.
   */
  const baseDurationMin = introductory
    ? introDurationMin
    : (largestFittingDuration(
        primaryService?.durationMin ?? DEFAULT_SESSION_DURATION_MIN
      ) ?? DEFAULT_SESSION_DURATION_MIN);

  const [day, setDay] = useState(bookableDays[0]?.value ?? '');
  const [time, setTime] = useState(
    firstFreeTime(bookableDays[0], baseDurationMin)
  );
  const [durationMin, setDurationMin] = useState<number>(baseDurationMin);

  const selectedDay = useMemo(
    () => bookableDays.find((d) => d.value === day),
    [bookableDays, day]
  );

  const stripRef = useRef<HTMLDivElement>(null);
  function scrollStrip(direction: -1 | 1) {
    stripRef.current?.scrollBy({ left: direction * 168, behavior: 'smooth' });
  }

  // Combined datetime-local value the server parses (Rome wall-clock).
  const scheduledFor = day && time ? `${day}T${time}` : '';

  /**
   * Sceglie l'orario e adatta la durata: uno slot troppo stretto per la
   * durata di riferimento del servizio si accorcia (mostrato da
   * `slotPresentation` come "tight"), uno slot libero la ripristina.
   */
  function chooseTime(next: string) {
    setTime(next);
    if (!selectedDay) return;
    const slot = slotPresentation(
      selectedDay.maxDurationMin,
      next,
      baseDurationMin,
      true
    );
    setDurationMin(slot.fitsDurationMin ?? baseDurationMin);
  }

  if (!introductory && services.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
        Questo coach non ha ancora configurato un servizio con una durata.
        La prenotazione sarà disponibile appena completerà il servizio.
      </p>
    );
  }

  return (
    <form
      id={FORM_ID}
      action={formAction}
      className="flex w-full flex-col gap-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="scheduledFor" value={scheduledFor} />
      {introductory ? (
        <input type="hidden" name="introductory" value="true" />
      ) : (
        <>
          <input
            type="hidden"
            name="serviceId"
            value={primaryService?.id ?? ''}
          />
          <input type="hidden" name="durationMin" value={durationMin} />
        </>
      )}

      {bookableDays.length > 0 ? (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-gray-900">
            Quando vorresti iniziare?
          </span>

          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-2.5">
            {/* Date strip: one card per bookable day, scrolls horizontally */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollStrip(-1)}
                aria-label="Giorni precedenti"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-white hover:text-gray-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div
                ref={stripRef}
                className="flex flex-1 gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {bookableDays.map((d) => {
                  const chip = dayChip(d.value);
                  const selected = d.value === day;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => {
                        setDay(d.value);
                        setTime(firstFreeTime(d, durationMin));
                      }}
                      aria-pressed={selected}
                      className={`flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-lg py-2 text-xs font-medium transition ${
                        selected
                          ? 'bg-red-600 text-white shadow-sm shadow-red-600/20'
                          : 'bg-white text-gray-600 hover:bg-red-50 hover:text-red-700'
                      }`}
                    >
                      <span className="uppercase opacity-80">
                        {chip.weekday}
                      </span>
                      <span className="text-base font-semibold leading-none">
                        {chip.number}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => scrollStrip(1)}
                aria-label="Giorni successivi"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-white hover:text-gray-700"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Times for the selected day */}
            <div className="mt-2.5 border-t border-gray-200 pt-2.5">
              {selectedDay && (
                <p className="mb-2 text-xs font-medium text-gray-500">
                  {selectedDay.label}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {selectedDay?.times.map((t) => {
                  const slot = slotPresentation(
                    selectedDay.maxDurationMin,
                    t,
                    durationMin,
                    true
                  );
                  const selected = t === time;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={!slot.selectable}
                      onClick={() => chooseTime(t)}
                      aria-pressed={selected}
                      title={slot.suffix ? slot.suffix.replace(' · ', '') : undefined}
                      className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium transition ${
                        selected
                          ? 'border-red-600 bg-red-600 text-white'
                          : slot.tone === 'occupied'
                            ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-300 line-through'
                            : slot.tone === 'tight'
                              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400'
                              : 'border-gray-200 bg-white text-gray-900 hover:border-red-400 hover:bg-red-50'
                      }`}
                    >
                      {t}
                      {slot.tone === 'tight' && (
                        <span className="ml-1 text-[10px] font-normal opacity-80">
                          {slot.suffix}
                        </span>
                      )}
                    </button>
                  );
                })}
                {!selectedDay?.times.length && (
                  <p className="text-sm text-gray-400">
                    Nessun orario libero questo giorno.
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Vedi solo i giorni e gli orari in cui {coachFirstName} riceve.
            Confermerete insieme.
          </p>
        </div>
      ) : (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {coachFirstName} non ha ancora pubblicato la sua disponibilità:
          proponi il tuo obiettivo e concorderete insieme un orario.
        </p>
      )}

      <div className="flex flex-col">
        <label htmlFor="note" className="text-sm font-medium text-gray-900">
          Raccontami i tuoi obiettivi
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={1000}
          className={fieldCls}
          placeholder="Es. Vorrei arrivare più tranquillo alle partite…"
        />
      </div>

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {isDemo && (
        <p className="text-sm text-gray-500">{DEMO_READONLY_MESSAGE}</p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full rounded-full text-base"
        disabled={
          isDemo || pending || (bookableDays.length > 0 && !scheduledFor)
        }
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Invio…
          </>
        ) : (
          `Invia la richiesta a ${coachFirstName}`
        )}
      </Button>
      <p className="-mt-2 text-center text-xs text-gray-500">
        Gratis e senza impegno.
      </p>
    </form>
  );
}

'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  SESSION_DURATION_OPTIONS,
} from '@/lib/core/bookings/duration';

type ServiceOption = {
  id: number;
  title: string | null;
  durationMin: number | null;
};

const fieldCls =
  'mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';

const FORM_ID = 'booking-request-form';
/** Matches the empty slot `page.tsx` renders at the top of the left column. */
const CONFIG_SLOT_ID = 'booking-config-slot';

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
}: {
  slug: string;
  coachFirstName: string;
  services: ServiceOption[];
  bookableDays: BookableDay[];
  /**
   * Dal riquadro "Sessione conoscitiva (free)": niente servizio da scegliere
   * (il coach può non averne ancora uno-intro, lo risolve il server) e
   * durata fissa a 20 minuti, non un valore fra cui scegliere.
   */
  introductory?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestBooking,
    { error: '' }
  );

  const introDurationMin = 20;
  const [day, setDay] = useState(bookableDays[0]?.value ?? '');
  const [serviceId, setServiceId] = useState('');
  const [time, setTime] = useState(
    firstFreeTime(
      bookableDays[0],
      introductory ? introDurationMin : DEFAULT_SESSION_DURATION_MIN
    )
  );
  const [durationMin, setDurationMin] = useState<number>(
    introductory ? introDurationMin : DEFAULT_SESSION_DURATION_MIN
  );
  /**
   * La durata voluta, distinta da quella in vigore: scegliere un orario
   * stretto abbassa la seconda, questa resta ferma ed è il valore a cui
   * tornare appena un orario torna a contenerla.
   */
  const [preferredDurationMin, setPreferredDurationMin] = useState<number>(
    introductory ? introDurationMin : DEFAULT_SESSION_DURATION_MIN
  );

  const selectedDay = useMemo(
    () => bookableDays.find((d) => d.value === day),
    [bookableDays, day]
  );

  const stripRef = useRef<HTMLDivElement>(null);
  function scrollStrip(direction: -1 | 1) {
    stripRef.current?.scrollBy({ left: direction * 168, behavior: 'smooth' });
  }

  /**
   * "Su cosa vuoi lavorare?" e "Quanto vuoi che duri?" si vedono nella
   * colonna a sinistra, vicino al resto della scheda del coach, non sopra il
   * calendario: qui c'era poco spazio e i due <select> lo occupavano prima
   * che l'atleta arrivasse a vedere gli orari. Restano dentro `<form>`
   * tramite l'attributo `form` sui controlli, non tramite la posizione nel
   * DOM — il portale li disegna altrove, ma FormData(form) li include lo
   * stesso. Il target esiste solo lato client, quindi prima del mount si
   * ripiega sul rendering qui in loco (mai un campo che sparisce).
   */
  const [configSlot, setConfigSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setConfigSlot(document.getElementById(CONFIG_SLOT_ID));
  }, []);

  // Combined datetime-local value the server parses (Rome wall-clock).
  const scheduledFor = day && time ? `${day}T${time}` : '';

  /**
   * Sceglie l'orario e adatta la durata, in entrambe le direzioni.
   *
   * Si prova sempre a mettere la durata voluta, e la si accorcia solo se in
   * quell'orario non ci sta: così uno slot stretto la abbassa e un orario
   * libero la rialza. Si valuta rispetto alla voluta e non alla corrente,
   * altrimenti ogni accorciamento sarebbe definitivo.
   */
  function chooseTime(next: string) {
    setTime(next);
    if (!selectedDay) return;
    const slot = slotPresentation(
      selectedDay.maxDurationMin,
      next,
      preferredDurationMin,
      true
    );
    setDurationMin(slot.fitsDurationMin ?? preferredDurationMin);
  }

  if (!introductory && services.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
        Questo coach non ha ancora configurato un servizio con una durata.
        La prenotazione sarà disponibile appena completerà il servizio.
      </p>
    );
  }

  const configFields = introductory ? null : (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:flex-row sm:gap-6">
      <div className="flex flex-1 flex-col">
        <label
          htmlFor="serviceId"
          className="text-sm font-medium text-gray-900"
        >
          Su cosa vuoi lavorare?
        </label>
        <select
          id="serviceId"
          name="serviceId"
          form={FORM_ID}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className={fieldCls}
          required
        >
          <option value="" disabled>
            Seleziona un servizio
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title ?? `Sessione`}
              {` · ${s.durationMin} min`}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 flex-col">
        <label htmlFor="durationMin" className="text-sm font-medium text-gray-900">
          Quanto vuoi che duri?
        </label>
        <select
          id="durationMin"
          name="durationMin"
          form={FORM_ID}
          value={durationMin}
          onChange={(e) => {
            const next = Number(e.target.value);
            setDurationMin(next);
            // Una durata scelta a mano è un'intenzione, non un valore di
            // passaggio: è quella a cui tornare su un orario che la contiene.
            setPreferredDurationMin(next);
            // Una sessione più lunga può non entrare più nell'orario scelto:
            // si ricade sul primo che la contiene.
            if (
              selectedDay &&
              isStartBusyForDuration(selectedDay.maxDurationMin, time, next)
            ) {
              setTime(firstFreeTime(selectedDay, next));
            }
          }}
          className={fieldCls}
          required
        >
          {SESSION_DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minuti
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <form
      id={FORM_ID}
      action={formAction}
      className="flex w-full flex-col gap-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="scheduledFor" value={scheduledFor} />
      {introductory && <input type="hidden" name="introductory" value="true" />}

      {configFields &&
        (configSlot ? createPortal(configFields, configSlot) : configFields)}

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
          Raccontagli il tuo obiettivo
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

      <Button
        type="submit"
        size="lg"
        className="w-full rounded-full text-base"
        disabled={pending || (bookableDays.length > 0 && !scheduledFor)}
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

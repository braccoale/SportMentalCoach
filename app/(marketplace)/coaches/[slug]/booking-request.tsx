'use client';

import { useActionState, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestBooking } from './actions';
import type { ActionState } from '@/lib/auth/middleware';
import type { BookableDay } from '@/lib/core/availability';

type ServiceOption = {
  id: number;
  title: string | null;
  durationMin: number | null;
};

const fieldCls =
  'mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';

function firstFreeTime(day?: BookableDay): string {
  return day?.times.find((time) => !day.busyTimes.includes(time)) ?? '';
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
}: {
  slug: string;
  coachFirstName: string;
  services: ServiceOption[];
  bookableDays: BookableDay[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestBooking,
    { error: '' }
  );

  const [day, setDay] = useState(bookableDays[0]?.value ?? '');
  const [time, setTime] = useState(firstFreeTime(bookableDays[0]));

  const selectedDay = useMemo(
    () => bookableDays.find((d) => d.value === day),
    [bookableDays, day]
  );

  // Combined datetime-local value the server parses (Rome wall-clock).
  const scheduledFor = day && time ? `${day}T${time}` : '';

  if (services.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
        Questo coach non ha ancora configurato un servizio con una durata.
        La prenotazione sarà disponibile appena completerà il servizio.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="scheduledFor" value={scheduledFor} />

      <div className="flex flex-col">
        <label
          htmlFor="serviceId"
          className="text-sm font-medium text-gray-900"
        >
          Su cosa vuoi lavorare?
        </label>
        <select
          id="serviceId"
          name="serviceId"
          defaultValue=""
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
        <p className="mt-1 text-xs text-gray-500">
          La durata è stabilita dal coach per ciascun servizio.
        </p>
      </div>

      {bookableDays.length > 0 ? (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-gray-900">
            Quando vorresti iniziare?
          </span>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col">
              <span className="text-xs text-gray-500">Giorno</span>
              <select
                value={day}
                onChange={(e) => {
                  const nextDay = e.target.value;
                  setDay(nextDay);
                  const first =
                    firstFreeTime(
                      bookableDays.find((d) => d.value === nextDay)
                    );
                  setTime(first);
                }}
                className={fieldCls}
              >
                {bookableDays.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              <span className="text-xs text-gray-500">Ora</span>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className={fieldCls}
              >
                {!time && (
                  <option value="" disabled>
                    Nessun orario libero
                  </option>
                )}
                {selectedDay?.times.map((t) => {
                  const busy = selectedDay.busyTimes.includes(t);
                  return (
                    <option
                      key={t}
                      value={t}
                      disabled={busy}
                      className={busy ? 'text-red-600' : undefined}
                      style={busy ? { color: '#dc2626' } : undefined}
                    >
                      {t}
                      {busy ? ' · Occupato' : ''}
                    </option>
                  );
                })}
              </select>
            </label>
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

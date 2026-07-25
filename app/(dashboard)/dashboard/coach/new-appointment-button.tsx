'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import type { RelationshipAthlete } from '@/lib/core/bookings';
import type { BookableDay } from '@/lib/core/availability';
import { createCoachBookingAction } from './actions';

/**
 * Coach-side "Nuovo appuntamento": lets the coach create an already-accepted
 * session directly with any registered athlete using one of the coach's
 * services. Stays visible even when there are no athletes at all
 * (disabled, with an explanatory hint) rather than disappearing. Safeguarding
 * is enforced server-side: minors without a confirmed guardian are rejected.
 *
 * The "when" field is the same constrained day+time picker the athlete gets:
 * options are pre-computed server-side in Rome time, so what the coach picks
 * is exactly what `parseRomeLocalDateTime` reads back. A free
 * `datetime-local` here would be interpreted in the *browser's* timezone and
 * silently shift for a coach travelling outside Italy.
 */
export function CoachNewAppointmentButton({
  athletes,
  services,
  availabilityHint,
  bookableDays,
}: {
  athletes: RelationshipAthlete[];
  services: { id: number; title: string; durationMin: number }[];
  /** Compact weekly availability summary, e.g. "Lun 09:00–18:00"; empty if none configured. */
  availabilityHint?: string;
  /** Selectable days/times from the coach's own weekly availability; empty if none set. */
  bookableDays: BookableDay[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(bookableDays[0]?.value ?? '');
  const [time, setTime] = useState(bookableDays[0]?.times[0] ?? '');

  const selectedDay = useMemo(
    () => bookableDays.find((d) => d.value === day),
    [bookableDays, day]
  );

  // Combined value the server parses as Rome wall-clock time.
  const scheduledFor = day && time ? `${day}T${time}` : '';

  // Re-anchor on the first option each time the dialog opens, so a page left
  // sitting open doesn't start on a slot that has since passed.
  function openDialog() {
    setDay(bookableDays[0]?.value ?? '');
    setTime(bookableDays[0]?.times[0] ?? '');
    setOpen(true);
  }

  if (athletes.length === 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          disabled
          className="rounded-full bg-green-600 text-white opacity-50"
        >
          <CalendarPlus className="mr-2 h-4 w-4" />
          Nuovo appuntamento
        </Button>
        <p className="text-xs text-gray-400">
          Nessun atleta registrato al momento.
        </p>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          disabled
          className="rounded-full bg-green-600 text-white opacity-50"
        >
          <CalendarPlus className="mr-2 h-4 w-4" />
          Nuovo appuntamento
        </Button>
        <Link
          href="/dashboard/coach/services"
          className="text-xs font-medium text-amber-700 hover:underline"
        >
          Configura un servizio con durata.
        </Link>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        onClick={openDialog}
        className="rounded-full bg-green-600 text-white hover:bg-green-700"
      >
        <CalendarPlus className="mr-2 h-4 w-4" />
        Nuovo appuntamento
      </Button>

      {open && (
        <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Chiudi"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/40"
          />
          <div className="absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Nuovo appuntamento
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Crea una sessione con uno dei tuoi atleti.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ActionForm
              action={createCoachBookingAction}
              className="mt-5 flex flex-col gap-4"
              onSuccess={(state) => {
                if (typeof state.bookingId === 'number') {
                  router.push(
                    `/dashboard/appointments/${state.bookingId}?created=1`
                  );
                }
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Atleta</span>
                <select
                  name="clientUserId"
                  defaultValue={athletes[0]?.userId}
                  required
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  {athletes.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">
                  Servizio
                </span>
                <select
                  name="serviceId"
                  defaultValue=""
                  required
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="" disabled>
                    Seleziona un servizio
                  </option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} · {s.durationMin} min
                    </option>
                  ))}
                </select>
              </label>

              <input type="hidden" name="scheduledFor" value={scheduledFor} />

              {bookableDays.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    Data e ora
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Giorno</span>
                      <select
                        value={day}
                        onChange={(e) => {
                          const nextDay = e.target.value;
                          setDay(nextDay);
                          setTime(
                            bookableDays.find((d) => d.value === nextDay)
                              ?.times[0] ?? ''
                          );
                        }}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      >
                        {bookableDays.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Ora</span>
                      <select
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      >
                        {selectedDay?.times.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {availabilityHint && (
                    <span className="text-xs text-gray-500">
                      La tua disponibilità: {availabilityHint}.
                    </span>
                  )}
                </div>
              ) : (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  Non hai ancora impostato la tua disponibilità settimanale: la
                  sessione verrà creata senza orario, da concordare in chat.
                </p>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">
                  Messaggio <span className="text-gray-400">(opzionale)</span>
                </span>
                <textarea
                  name="note"
                  rows={3}
                  maxLength={1000}
                  placeholder="Note per l'atleta"
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>

              <div className="mt-1 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="rounded-full"
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  className="rounded-full bg-green-600 text-white hover:bg-green-700"
                >
                  Crea sessione
                </Button>
              </div>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}

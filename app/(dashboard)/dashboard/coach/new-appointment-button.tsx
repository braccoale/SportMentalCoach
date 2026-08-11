'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarPlus, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import type { RelationshipAthlete } from '@/lib/core/bookings';
import {
  DEFAULT_SESSION_DURATION_MIN,
  SESSION_DURATION_OPTIONS,
} from '@/lib/core/bookings/duration';
import type { BookableDay } from '@/lib/core/availability';
import {
  dropPastStarts,
  isStartBusyForDuration,
  slotLabelSuffix,
} from '@/lib/core/availability/validation';
import { createCoachBookingAction } from './actions';

type ServiceOption = { id: number; title: string; durationMin: number };

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
 *
 * The service starts pre-selected on the last one used with the chosen
 * athlete: with the same person a coach almost always repeats the same
 * service, so that is the default worth saving them a click on.
 *
 * Duration is chosen per session rather than inherited from the service: the
 * same service runs 30 minutes with one athlete and 60 with another, and it is
 * the session's length — not the service's — that decides which slots are
 * still free.
 *
 * "Avvia sessione ora" is the same creation, with the start set server-side to
 * now: the session is created, the athlete's app rings via the incoming-call
 * popup as soon as the coach lands in the room, and the day/time picker is
 * simply not consulted.
 */
export function CoachNewAppointmentButton({
  athletes,
  services,
  bookableDays,
  lastServiceByAthlete = {},
}: {
  athletes: RelationshipAthlete[];
  services: ServiceOption[];
  /** Selectable days/times from the coach's own weekly availability; empty if none set. */
  bookableDays: BookableDay[];
  /** Athlete user id → service id of their most recent booking with this coach. */
  lastServiceByAthlete?: Record<number, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientUserId, setClientUserId] = useState(
    () => athletes[0]?.userId ?? 0
  );
  const [serviceId, setServiceId] = useState('');
  const [durationMin, setDurationMin] = useState<number>(
    DEFAULT_SESSION_DURATION_MIN
  );
  // Le opzioni arrivano calcolate dal server: si ripuliscono dagli orari nel
  // frattempo scaduti a ogni apertura del dialog, non qui, perché al primo
  // render devono coincidere con l'HTML del server (idratazione).
  const [days, setDays] = useState(bookableDays);
  const [day, setDay] = useState(bookableDays[0]?.value ?? '');
  const [time, setTime] = useState(
    firstFreeTime(bookableDays[0], DEFAULT_SESSION_DURATION_MIN)
  );

  const selectedDay = useMemo(
    () => days.find((d) => d.value === day),
    [days, day]
  );

  /**
   * Last service used with `athleteUserId`, as a `<select>` value — empty when
   * there is no history or that service is no longer offered (deleted or
   * deactivated), so the coach is asked rather than shown a stale default.
   */
  function defaultServiceFor(athleteUserId: number): string {
    const last = lastServiceByAthlete[athleteUserId];
    return services.some((s) => s.id === last) ? String(last) : '';
  }

  // Combined value the server parses as Rome wall-clock time.
  const scheduledFor = day && time ? `${day}T${time}` : '';

  /**
   * Switch duration and keep the start valid: a longer session may no longer
   * fit the chosen start, so fall back to the first one that does.
   */
  function pickDuration(next: number) {
    setDurationMin(next);
    if (
      selectedDay &&
      isStartBusyForDuration(selectedDay.maxDurationMin, time, next)
    ) {
      setTime(firstFreeTime(selectedDay, next));
    }
  }

  // Re-anchor on the first option each time the dialog opens, so a page left
  // sitting open doesn't start on a slot that has since passed. Gli orari già
  // passati vanno tolti davvero dalla lista: ri-ancorarsi alla prima opzione
  // di un elenco vecchio significa proporre un orario che il server rifiuta.
  function openDialog() {
    const athleteUserId = athletes[0]?.userId ?? 0;
    const freshDays = dropPastStarts(bookableDays, new Date());
    setClientUserId(athleteUserId);
    setServiceId(defaultServiceFor(athleteUserId));
    setDurationMin(DEFAULT_SESSION_DURATION_MIN);
    setDays(freshDays);
    setDay(freshDays[0]?.value ?? '');
    setTime(firstFreeTime(freshDays[0], DEFAULT_SESSION_DURATION_MIN));
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
          {/* Il pannello scorre: su telefono il form è più alto dello schermo,
              e senza scroll i pulsanti e il messaggio di errore restano
              irraggiungibili. */}
          <div className="absolute left-1/2 top-1/2 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
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
              messageFirst
              className="mt-5 flex flex-col gap-4"
              onSuccess={(state) => {
                if (typeof state.bookingId !== 'number') return;
                // Sessione avviata ora: si entra direttamente nella stanza, ed
                // è l'ingresso del coach a far squillare l'app dell'atleta.
                router.push(
                  state.startedNow
                    ? `/dashboard/video/${state.bookingId}`
                    : `/dashboard/appointments/${state.bookingId}?created=1`
                );
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Atleta</span>
                <select
                  name="clientUserId"
                  value={clientUserId}
                  onChange={(e) => {
                    const nextAthlete = Number(e.target.value);
                    setClientUserId(nextAthlete);
                    // Ogni atleta porta con sé il proprio default: senza
                    // storico si lascia in piedi la scelta già fatta.
                    const nextServiceId = defaultServiceFor(nextAthlete);
                    if (nextServiceId) setServiceId(nextServiceId);
                  }}
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
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
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

              {days.length > 0 ? (
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
                            firstFreeTime(
                              days.find((d) => d.value === nextDay),
                              durationMin
                            )
                          );
                        }}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      >
                        {days.map((d) => (
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
                        required
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      >
                        {!time && (
                          <option value="" disabled>
                            Nessun orario libero
                          </option>
                        )}
                        {selectedDay?.times.map((t) => {
                          const busy = isStartBusyForDuration(
                            selectedDay.maxDurationMin,
                            t,
                            durationMin
                          );
                          return (
                            <option
                              key={t}
                              value={t}
                              disabled={busy}
                              className={busy ? 'text-red-600' : undefined}
                              style={busy ? { color: '#dc2626' } : undefined}
                            >
                              {t}
                              {slotLabelSuffix(
                                selectedDay.maxDurationMin,
                                t,
                                durationMin
                              )}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>
                </div>
              ) : bookableDays.length > 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Gli orari proposti sono nel frattempo passati. Ricarica la
                  pagina per vedere quelli ancora disponibili.
                </p>
              ) : (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  Non hai ancora impostato la tua disponibilità settimanale: la
                  sessione verrà creata senza orario, da concordare in chat.
                </p>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Durata</span>
                <select
                  name="durationMin"
                  value={durationMin}
                  onChange={(e) => pickDuration(Number(e.target.value))}
                  required
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  {SESSION_DURATION_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minuti
                    </option>
                  ))}
                </select>
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
                {/* Primo submit del form, quindi anche quello che scatta
                    premendo Invio in un campo: deve essere l'azione normale,
                    non l'avvio di una chiamata. */}
                <Button
                  type="submit"
                  disabled={bookableDays.length > 0 && !scheduledFor}
                  className="rounded-full bg-green-600 text-white hover:bg-green-700"
                >
                  Crea sessione
                </Button>
              </div>

              {/* Avvia ora ignora giorno e ora scelti: la sessione parte
                  adesso e l'orario lo mette il server. Resta quindi
                  utilizzabile anche quando non c'è nessuno slot libero. */}
              <div className="border-t border-gray-100 pt-4">
                <Button
                  type="submit"
                  name="startNow"
                  value="1"
                  variant="outline"
                  className="w-full rounded-full border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"
                >
                  <Video className="mr-2 h-4 w-4" />
                  Avvia sessione ora
                </Button>
                <p className="mt-2 text-center text-xs text-gray-500">
                  Crea la sessione con inizio adesso e apre la videochiamata:
                  giorno e ora qui sopra non vengono usati.
                </p>
              </div>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}

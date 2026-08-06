'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CalendarPlus, UserRound, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import type { RelationshipCoach } from '@/lib/core/bookings';
import {
  DEFAULT_SESSION_DURATION_MIN,
  SESSION_DURATION_OPTIONS,
} from '@/lib/core/bookings/duration';
import {
  dropPastStarts,
  isStartBusyForDuration,
} from '@/lib/core/availability/validation';
import { createBookingRequestAction } from './actions';

type BookableDay = RelationshipCoach['bookableDays'][number];

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
 * "Nuovo appuntamento" quick-rebook. Scoped on purpose: the coach dropdown only
 * lists coaches the athlete already knows (booked before / favourited), so this
 * complements — rather than replaces — marketplace discovery. With no such
 * coach yet, it degrades to a "Trova un coach" link.
 */
export function NewAppointmentButton({ coaches }: { coaches: RelationshipCoach[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Default to the last-followed coach (coaches are ordered by recency).
  const [slug, setSlug] = useState(coaches[0]?.slug ?? '');

  const selected = useMemo(
    () => coaches.find((c) => c.slug === slug),
    [coaches, slug]
  );

  // Day/time options come pre-computed from the server in Rome time — the same
  // zone `parseRomeLocalDateTime` reads them back in. A free `datetime-local`
  // would be interpreted in the browser's timezone and silently shift for an
  // athlete outside Italy.
  // Gli orari di oggi sono filtrati sull'orologio del server al momento del
  // render: se la pagina è rimasta aperta, quelli passati vanno tolti davvero,
  // altrimenti il picker propone un orario che il server rifiuta. Si ricalcola
  // all'apertura del dialog, mai al primo render (idratazione).
  const [openedAt, setOpenedAt] = useState<Date | null>(null);
  const days = useMemo(() => {
    const all = selected?.bookableDays ?? [];
    return openedAt ? dropPastStarts(all, openedAt) : all;
  }, [selected, openedAt]);
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [durationMin, setDurationMin] = useState<number>(
    DEFAULT_SESSION_DURATION_MIN
  );

  const selectedDay = useMemo(
    () => days.find((d) => d.value === day),
    [days, day]
  );
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

  /** Bookable days of a coach, senza gli orari già passati. */
  function freshDaysFor(coachSlug: string, at: Date | null) {
    const all = coaches.find((c) => c.slug === coachSlug)?.bookableDays ?? [];
    return at ? dropPastStarts(all, at) : all;
  }

  /** Points day/time at the first option of the given coach (or clears them). */
  function resetWhenFor(coachSlug: string) {
    const first = freshDaysFor(coachSlug, openedAt)[0];
    setServiceId('');
    setDay(first?.value ?? '');
    setTime(firstFreeTime(first, durationMin));
  }

  function openDialog() {
    const at = new Date();
    const first = coaches[0]?.slug ?? '';
    const firstDay = freshDaysFor(first, at)[0];
    setOpenedAt(at);
    setSlug(first);
    setServiceId('');
    setDurationMin(DEFAULT_SESSION_DURATION_MIN);
    setDay(firstDay?.value ?? '');
    setTime(firstFreeTime(firstDay, DEFAULT_SESSION_DURATION_MIN));
    setOpen(true);
  }

  if (coaches.length === 0) {
    return (
      <Button
        asChild
        className="rounded-full bg-green-600 text-white hover:bg-green-700"
      >
        <Link href="/coaches">
          <UserRound className="mr-2 h-4 w-4" />
          Trova un coach
        </Link>
      </Button>
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
          {/* Il pannello scorre: su telefono il form supera l'altezza dello
              schermo, e senza scroll pulsanti ed errori restano irraggiungibili. */}
          <div className="absolute left-1/2 top-1/2 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Nuovo appuntamento
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Richiedi una sessione a un coach con cui hai già lavorato.
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
              action={createBookingRequestAction}
              messageFirst
              className="mt-5 flex flex-col gap-4"
              onSuccess={(state) => {
                if (typeof state.bookingId !== 'number') return;
                // Chiamata avviata: si entra direttamente nella stanza, ed è
                // l'ingresso dell'atleta a far squillare l'app del coach.
                router.push(
                  state.startedNow
                    ? `/dashboard/video/${state.bookingId}`
                    : `/dashboard/appointments/${state.bookingId}?created=1`
                );
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Coach</span>
                <select
                  name="coachSlug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    resetWhenFor(e.target.value);
                  }}
                  required
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  {coaches.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">
                  Servizio
                </span>
                <select
                  key={slug}
                  name="serviceId"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  required
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="" disabled>
                    Seleziona un servizio
                  </option>
                  {selected?.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} · {s.durationMin} min
                    </option>
                  ))}
                </select>
                {selected?.services.length === 0 && (
                  <span className="text-xs text-amber-700">
                    Questo coach deve ancora configurare un servizio con durata.
                  </span>
                )}
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
                              {busy ? ' · Occupato' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>
                  {selected?.availabilityHint && (
                    <span className="text-xs text-gray-500">
                      Disponibile: {selected.availabilityHint}.
                    </span>
                  )}
                </div>
              ) : (selected?.bookableDays.length ?? 0) > 0 ? (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Gli orari proposti sono nel frattempo passati. Ricarica la
                  pagina per vedere quelli ancora disponibili.
                </p>
              ) : (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {selected?.name ?? 'Il coach'} non ha ancora pubblicato la sua
                  disponibilità: l’orario lo concorderete in chat.
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

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">
                  Messaggio <span className="text-gray-400">(opzionale)</span>
                </span>
                <textarea
                  name="note"
                  rows={3}
                  maxLength={1000}
                  placeholder="Su cosa vuoi lavorare?"
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
                {/* Primo submit del form, quindi anche quello che scatta
                    premendo Invio in un campo: deve essere l'azione normale,
                    non l'avvio di una chiamata. */}
                <Button
                  type="submit"
                  disabled={
                    !selected ||
                    selected.services.length === 0 ||
                    // Un coach con disponibilità pubblicata va sempre prenotato
                    // su uno slot: se la lista è scaduta si ricarica, non si
                    // ripiega su una richiesta senza orario.
                    (selected.bookableDays.length > 0 && !scheduledFor)
                  }
                  className="rounded-full bg-green-600 text-white hover:bg-green-700"
                >
                  Invia richiesta
                </Button>
              </div>

              {/* Chiamare adesso non passa dall'accettazione del coach, quindi
                  resta possibile solo dentro le fasce che il coach ha
                  pubblicato: è lui a decidere quando può essere chiamato. */}
              <div className="border-t border-gray-100 pt-4">
                <Button
                  type="submit"
                  name="startNow"
                  value="1"
                  variant="outline"
                  disabled={
                    !selected ||
                    selected.services.length === 0 ||
                    !selected.canCallNow
                  }
                  className="w-full rounded-full border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800"
                >
                  <Video className="mr-2 h-4 w-4" />
                  Avvia sessione ora
                </Button>
                <p className="mt-2 text-center text-xs text-gray-500">
                  {selected && !selected.canCallNow
                    ? `${selected.name} non è disponibile in questo momento${
                        selected.availabilityHint
                          ? `: ${selected.availabilityHint}`
                          : ''
                      }.`
                    : 'Chiama subito il coach e apre la videochiamata: giorno e ora qui sopra non vengono usati.'}
                </p>
              </div>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}

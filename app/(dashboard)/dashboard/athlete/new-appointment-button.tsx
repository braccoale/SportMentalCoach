'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CalendarPlus, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import type { RelationshipCoach } from '@/lib/core/bookings';
import { createBookingRequestAction } from './actions';

function firstFreeTime(day?: RelationshipCoach['bookableDays'][number]): string {
  return day?.times.find((time) => !day.busyTimes.includes(time)) ?? '';
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
  const days = selected?.bookableDays ?? [];
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');

  const selectedDay = useMemo(
    () => days.find((d) => d.value === day),
    [days, day]
  );
  const scheduledFor = day && time ? `${day}T${time}` : '';

  /** Points day/time at the first option of the given coach (or clears them). */
  function resetWhenFor(coachSlug: string) {
    const first = coaches.find((c) => c.slug === coachSlug)?.bookableDays[0];
    setDay(first?.value ?? '');
    setTime(firstFreeTime(first));
  }

  function openDialog() {
    const first = coaches[0]?.slug ?? '';
    setSlug(first);
    resetWhenFor(first);
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
          <div className="absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
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
                  defaultValue=""
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
                              days.find((d) => d.value === nextDay)
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
                  {selected?.availabilityHint && (
                    <span className="text-xs text-gray-500">
                      Disponibile: {selected.availabilityHint}.
                    </span>
                  )}
                </div>
              ) : (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {selected?.name ?? 'Il coach'} non ha ancora pubblicato la sua
                  disponibilità: l’orario lo concorderete in chat.
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
                <Button
                  type="submit"
                  disabled={
                    !selected ||
                    selected.services.length === 0 ||
                    (days.length > 0 && !scheduledFor)
                  }
                  className="rounded-full bg-green-600 text-white hover:bg-green-700"
                >
                  Invia richiesta
                </Button>
              </div>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}

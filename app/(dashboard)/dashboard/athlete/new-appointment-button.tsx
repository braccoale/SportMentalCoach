'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarPlus, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import type { RelationshipCoach } from '@/lib/core/bookings';
import { createBookingRequestAction } from './actions';

/**
 * "Nuovo appuntamento" quick-rebook. Scoped on purpose: the coach dropdown only
 * lists coaches the athlete already knows (booked before / favourited), so this
 * complements — rather than replaces — marketplace discovery. With no such
 * coach yet, it degrades to a "Trova un coach" link.
 */
/** Current local date-time as a `YYYY-MM-DDTHH:mm` string for datetime-local. */
function nowLocalDateTime(): string {
  const now = new Date();
  const off = now.getTimezoneOffset();
  return new Date(now.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function NewAppointmentButton({ coaches }: { coaches: RelationshipCoach[] }) {
  const [open, setOpen] = useState(false);
  // Default to the last-followed coach (coaches are ordered by recency).
  const [slug, setSlug] = useState(coaches[0]?.slug ?? '');
  // Recomputed each time the dialog opens so the time stays "current".
  const [defaultWhen, setDefaultWhen] = useState('');

  const selected = useMemo(
    () => coaches.find((c) => c.slug === slug),
    [coaches, slug]
  );

  function openDialog() {
    setSlug(coaches[0]?.slug ?? '');
    setDefaultWhen(nowLocalDateTime());
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
              onSuccess={() => setTimeout(() => setOpen(false), 1000)}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Coach</span>
                <select
                  name="coachSlug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
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
                  Servizio <span className="text-gray-400">(opzionale)</span>
                </span>
                <select
                  name="serviceId"
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="">Richiesta generica</option>
                  {selected?.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">
                  Data e ora <span className="text-gray-400">(opzionale)</span>
                </span>
                <input
                  type="datetime-local"
                  name="scheduledFor"
                  defaultValue={defaultWhen}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
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
                <Button
                  type="submit"
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

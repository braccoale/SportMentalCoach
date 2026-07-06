'use client';

import { useActionState, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestBooking } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

type ServiceOption = {
  id: number;
  title: string | null;
  durationMin: number | null;
};

const fieldCls =
  'mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';

/**
 * Booking request form — human copy, no "(optional)" noise. Visual order:
 * service → when → message → big CTA. The availability hint sits next to the
 * date field so the athlete picks a time that can actually work.
 */
export function BookingRequest({
  slug,
  coachFirstName,
  services,
  availabilityHint,
}: {
  slug: string;
  coachFirstName: string;
  services: ServiceOption[];
  availabilityHint?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestBooking,
    { error: '' }
  );

  // min for datetime-local (client-only to avoid hydration mismatch).
  const [minDt, setMinDt] = useState<string | undefined>(undefined);
  useEffect(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    setMinDt(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
    );
  }, []);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      {services.length > 0 && (
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
          >
            <option value="">Lo decidete insieme</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title ?? `Sessione`}
                {s.durationMin ? ` · ${s.durationMin} min` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col">
        <label
          htmlFor="scheduledFor"
          className="text-sm font-medium text-gray-900"
        >
          Quando vorresti iniziare?
        </label>
        <input
          id="scheduledFor"
          name="scheduledFor"
          type="datetime-local"
          min={minDt}
          className={fieldCls}
        />
        <p className="mt-1 text-xs text-gray-500">
          {availabilityHint
            ? `Di solito è libero: ${availabilityHint}. `
            : ''}
          È solo una preferenza — confermerete insieme.
        </p>
      </div>

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
        disabled={pending}
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

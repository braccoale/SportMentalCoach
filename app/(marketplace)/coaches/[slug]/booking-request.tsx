'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestBooking } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

type ServiceOption = { id: number; title: string | null };

export function BookingRequest({
  slug,
  services,
  ctaLabel,
}: {
  slug: string;
  services: ServiceOption[];
  ctaLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestBooking,
    { error: '' }
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-3">
      <input type="hidden" name="slug" value={slug} />

      {services.length > 0 && (
        <div className="flex w-full max-w-sm flex-col">
          <label htmlFor="serviceId" className="text-sm font-medium text-gray-700">
            Servizio (opzionale)
          </label>
          <select
            id="serviceId"
            name="serviceId"
            defaultValue=""
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Nessun servizio specifico</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title ?? `Servizio #${s.id}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex w-full max-w-sm flex-col">
        <label
          htmlFor="scheduledFor"
          className="text-sm font-medium text-gray-700"
        >
          Data e ora preferita (opzionale)
        </label>
        <input
          id="scheduledFor"
          name="scheduledFor"
          type="datetime-local"
          className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="flex w-full max-w-sm flex-col">
        <label htmlFor="note" className="text-sm font-medium text-gray-700">
          Messaggio per il coach (opzionale)
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={1000}
          className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          placeholder="Raccontagli brevemente il tuo obiettivo…"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      <Button
        type="submit"
        size="lg"
        className="rounded-full"
        disabled={pending}
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Invio…
          </>
        ) : (
          ctaLabel
        )}
      </Button>
    </form>
  );
}

'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendMessageAction } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

export function ChatComposer({ bookingId }: { bookingId: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    sendMessageAction,
    {}
  );

  // Clear the textarea after a successful send.
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <textarea
        name="body"
        rows={3}
        required
        maxLength={4000}
        placeholder="Scrivi un messaggio…"
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
      />
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="rounded-full">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Invia'}
        </Button>
        <span className="text-xs text-gray-400">
          Aggiorna la pagina per vedere i nuovi messaggi.
        </span>
      </div>
    </form>
  );
}

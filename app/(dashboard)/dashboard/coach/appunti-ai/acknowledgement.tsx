'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * «Ho letto» in fondo alla nota, non in cima.
 *
 * In cima sarebbe un pulsante da premere per far sparire un cartello. In fondo
 * bisogna almeno scorrere fino a lì — che non garantisce la lettura, ma non la
 * rende inutile per costruzione.
 */
export function AiLiteracyAcknowledgement({
  action,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    { error: '' }
  );

  return (
    <form action={formAction}>
      <p className="text-sm text-gray-600">
        Confermando, registriamo che hai preso visione di questa nota. Serve a
        noi per dimostrare di averla messa a disposizione, come richiede l’art. 4
        del regolamento europeo sull’intelligenza artificiale.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Ho letto la nota
      </button>
      {state?.error && (
        <p className="mt-2 text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}

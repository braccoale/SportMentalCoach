'use client';

import { useActionState, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { signCoachAgreementAction } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

export function AgreementForm({
  vexatiousTitles,
  children,
}: {
  vexatiousTitles: string[];
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    signCoachAgreementAction,
    { error: '' }
  );
  // Firmare senza aver scorso il documento è la firma che non regge. Il
  // pulsante resta chiuso finché il testo non è stato percorso fino in fondo.
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setScrolledToEnd(true);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <div
        ref={boxRef}
        onScroll={onScroll}
        className="h-96 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 text-[15px] leading-relaxed text-gray-700 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 [&_p]:mt-2"
      >
        {children}
      </div>

      {!scrolledToEnd && (
        <p className="text-sm text-gray-500">
          Scorri il contratto fino in fondo per poterlo firmare.
        </p>
      )}

      <label className="flex items-start gap-3 text-sm text-gray-700">
        <input type="checkbox" name="acceptTerms" className="mt-1" required />
        <span>
          Dichiaro di aver letto e di accettare integralmente il Contratto di
          Adesione Coach.
        </span>
      </label>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <label className="flex items-start gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            name="acceptVexatious"
            className="mt-1"
            required
          />
          <span>
            Ai sensi degli artt. 1341 e 1342 c.c. approvo specificamente le
            clausole:{' '}
            <strong>{vexatiousTitles.join('; ')}</strong>.
          </span>
        </label>
      </div>

      <div>
        <label
          htmlFor="signature"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          Firma: scrivi il tuo nome e cognome
        </label>
        <input
          id="signature"
          name="signature"
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Nome Cognome"
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || !scrolledToEnd}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Firma in corso…
          </>
        ) : (
          'Firma e prosegui'
        )}
      </button>
    </form>
  );
}

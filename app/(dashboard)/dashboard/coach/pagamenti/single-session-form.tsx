'use client';

import { useActionState, useRef, useState } from 'react';
import { CalendarDays, Coins, Save, TicketCheck } from 'lucide-react';
import type { ActionState } from '@/lib/auth/middleware';
import { saveSingleSessionPriceAction } from './actions';

/**
 * La scheda «Seduta singola»: il prezzo di UNA seduta, deciso dal coach.
 * Compare agli atleti come «una sola seduta» (senza abbonamento) e come
 * «aggiungi una seduta» (con l'abbonamento). L'interruttore spento equivale a
 * un prezzo vuoto: la seduta non si vende, e si salva subito.
 */
export function SingleSessionForm({
  currentPrice,
  minLabel,
  maxLabel,
  validityLabel,
}: {
  /** Già formattato dal server («100,00»), o vuoto se non è impostato. */
  currentPrice: string;
  minLabel: string;
  maxLabel: string;
  /** «60 giorni»: la durata decisa dalla piattaforma, non dal coach. */
  validityLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveSingleSessionPriceAction,
    {}
  );
  const [enabled, setEnabled] = useState(currentPrice !== '');
  const [price, setPrice] = useState(currentPrice);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      // Accesa: serve un prezzo, si salva con «Salva prezzo».
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      // Spenta: si salva subito, con il campo vuoto.
      setPrice('');
      setTimeout(() => formRef.current?.requestSubmit(), 0);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 -right-10 hidden h-64 w-80 rounded-full bg-emerald-50 sm:block"
      />
      <TicketCheck
        aria-hidden
        className="pointer-events-none absolute bottom-5 right-8 hidden h-24 w-24 text-emerald-300 sm:block"
        strokeWidth={1.25}
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h3 className="text-lg font-bold text-gray-950">Seduta singola</h3>
            <p className="mt-0.5 max-w-md text-sm text-gray-600">
              Permetti agli atleti di acquistare una seduta extra senza abbonamento.
              Utile anche per chi ha già un piano ma ha terminato le sedute del mese.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Seduta singola attiva"
            onClick={toggle}
            disabled={pending}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
              enabled ? 'bg-emerald-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                enabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {enabled ? 'Attiva' : 'Non attiva'}
            </p>
            <p className="max-w-[12rem] text-xs text-gray-500">
              {enabled
                ? 'La seduta singola è acquistabile dagli atleti.'
                : 'Gli atleti non la vedono.'}
            </p>
          </div>
        </div>
      </div>

      <form ref={formRef} action={formAction} noValidate className="relative mt-4 border-t border-gray-100 pt-4">
        <label htmlFor="single-session-price" className="text-sm font-semibold text-gray-900">
          Prezzo della seduta singola
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div
            className={`flex h-12 w-52 items-center rounded-xl border bg-white px-3 ${
              enabled ? 'border-gray-300 focus-within:border-emerald-600' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <span className="mr-2 text-gray-500">€</span>
            <input
              ref={inputRef}
              id="single-session-price"
              name="singleSessionPrice"
              inputMode="decimal"
              value={price}
              disabled={!enabled}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
              aria-describedby="single-session-hint"
              className="w-full bg-transparent text-lg font-semibold text-gray-950 outline-none disabled:text-gray-400"
            />
          </div>
          <button
            type="submit"
            disabled={pending || !enabled}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            {pending ? 'Salvataggio…' : 'Salva prezzo'}
          </button>
        </div>

        <div id="single-session-hint" className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Coins className="h-4 w-4" aria-hidden />
            Da {minLabel} a {maxLabel}.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Una seduta acquistata vale {validityLabel}.
          </span>
        </div>
        <div role="status" aria-live="polite">
          {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
          {state.success && <p className="mt-2 text-sm text-emerald-700">{state.success}</p>}
        </div>
      </form>
    </section>
  );
}

'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionState } from '@/lib/auth/middleware';
import { saveSingleSessionPriceAction } from './actions';

/**
 * Il prezzo di UNA seduta, deciso dal coach. Compare agli atleti come «una sola
 * seduta» (senza abbonamento) e come «aggiungi una seduta» (con l'abbonamento).
 * Campo vuoto = non la vendo.
 */
export function SingleSessionForm({
  currentPrice,
  minLabel,
  maxLabel,
}: {
  /** Già formattato dal server («100,00»), o vuoto se non è impostato. */
  currentPrice: string;
  minLabel: string;
  maxLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveSingleSessionPriceAction,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <div className="flex flex-1 flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="single-session-price">Prezzo di una seduta (€)</Label>
        <Input
          id="single-session-price"
          name="singleSessionPrice"
          inputMode="decimal"
          defaultValue={currentPrice}
          placeholder="Vuoto = non la vendo"
          aria-describedby="single-session-hint"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvataggio…' : 'Salva'}
      </Button>
      <div className="sm:basis-full" role="status" aria-live="polite">
        <p id="single-session-hint" className="text-xs text-gray-500">
          Da {minLabel} a {maxLabel}. Una seduta acquistata vale 60 giorni.
          Lasciando il campo vuoto la seduta singola non viene venduta.
        </p>
        {state.error && <p className="mt-1 text-sm text-red-700">{state.error}</p>}
        {state.success && <p className="mt-1 text-sm text-emerald-700">{state.success}</p>}
      </div>
    </form>
  );
}

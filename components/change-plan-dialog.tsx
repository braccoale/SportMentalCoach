'use client';

import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { changePlanAction } from '@/app/(marketplace)/coaches/subscription-actions';
import { cn } from '@/lib/utils';

export type PlanChangeOption = {
  id: number;
  name: string;
  sessionsPerMonth: number;
  /** Già formattato: «300,00 €». */
  priceLabel: string;
  current: boolean;
  pending: boolean;
};

/**
 * «Cambia piano»: tra i piani attivi del coach, dal prossimo rinnovo e senza
 * calcolo proporzionale. Non cambia niente di ciò che è già pagato e
 * prenotato in questo periodo; lo dice, perché è la prima domanda.
 *
 * Scegliere di nuovo il piano attuale, quando c'è un cambio programmato, lo
 * annulla: il pulsante cambia testo per dirlo.
 */
export function ChangePlanDialog({
  slug,
  returnTo,
  subscriptionId,
  options,
  effectiveLabel,
}: {
  slug: string;
  returnTo?: 'abbonamenti';
  subscriptionId: number;
  options: PlanChangeOption[];
  /** «7 dicembre 2026», o null se la data non si sa. */
  effectiveLabel: string | null;
}) {
  const current = options.find((o) => o.current);
  const pending = options.find((o) => o.pending);
  const [selected, setSelected] = useState<number | null>(
    pending?.id ?? options.find((o) => !o.current)?.id ?? null
  );
  const choosingCurrent = selected !== null && selected === current?.id;
  // Il piano attuale, senza un cambio da annullare, non è una scelta.
  const nothingToDo = selected === null || (choosingCurrent && !pending);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full gap-2 rounded-xl border-gray-200 text-sm font-semibold text-gray-700"
        >
          <ArrowLeftRight className="h-4 w-4" aria-hidden />
          Cambia piano
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg rounded-3xl p-6">
        <DialogTitle className="text-xl">Cambia piano</DialogTitle>
        <DialogDescription>
          Il nuovo piano parte dal prossimo rinnovo
          {effectiveLabel ? ` (${effectiveLabel})` : ''}. Fino ad allora non
          cambia niente: le sedute di questo mese e il prezzo restano quelli di
          adesso, senza conguagli.
        </DialogDescription>
        <form action={changePlanAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="slug" value={slug} />
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          <input type="hidden" name="subscriptionId" value={subscriptionId} />
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Scegli il piano</legend>
            {options.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm',
                  selected === option.id
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-gray-200 bg-white hover:border-emerald-400'
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="planId"
                    value={option.id}
                    checked={selected === option.id}
                    onChange={() => setSelected(option.id)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span>
                    <span className="block font-semibold text-gray-900">
                      {option.name}
                      {option.current ? ' · il tuo piano' : ''}
                      {option.pending ? ' · in arrivo' : ''}
                    </span>
                    <span className="block text-gray-600">
                      {option.sessionsPerMonth}{' '}
                      {option.sessionsPerMonth === 1 ? 'seduta' : 'sedute'} al mese
                    </span>
                  </span>
                </span>
                <span className="font-semibold text-gray-900">
                  {option.priceLabel}
                  <span className="font-normal text-gray-500"> /mese</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="rounded-full">
                Chiudi
              </Button>
            </DialogClose>
            <Button
              type="submit"
              className="rounded-full bg-green-600 text-white hover:bg-green-700"
              disabled={nothingToDo}
            >
              {choosingCurrent ? 'Annulla il cambio' : 'Programma il cambio'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

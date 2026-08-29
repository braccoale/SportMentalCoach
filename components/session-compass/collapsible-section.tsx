'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Un blocco della Panoramica che si può richiudere.
 *
 * Aprendo la pagina i blocchi sono **aperti**: il riepilogo si legge
 * scorrendo, non aprendo quattro pannelli uno per uno per scoprire cosa
 * contengono. Un titolo con dentro un'anteprima nascosta costringe a cliccare
 * per sapere se valeva la pena cliccare.
 *
 * Resta il richiudere: chi ha già letto un blocco, o non gliene importa, lo
 * chiude e quella parte di pagina sparisce fino al prossimo clic.
 *
 * `<details>` nativo di proposito: nessuno stato da gestire, funziona senza
 * JavaScript, e il browser si occupa da solo di tastiera e accessibilità.
 */
export function CollapsibleSection({
  eyebrow,
  title,
  hint,
  defaultOpen = true,
  children,
}: {
  /** Sopratitolo breve e maiuscolo, come nel resto della Panoramica. */
  eyebrow?: string;
  title: string;
  /** Cosa c'è dentro, per chi decide se richiuderlo: «2 momenti», «1 tema». */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group min-w-0 max-w-full rounded-2xl border border-gray-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          {eyebrow ? (
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">
              {eyebrow}
            </span>
          ) : null}
          <span className="mt-0.5 block text-base font-bold text-gray-950">
            {title}
            {hint ? (
              <span className="ml-2 text-sm font-medium text-gray-500">
                {hint}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
        />
      </summary>
      {/*
        Il contenuto arriva con la sua superficie e con la sua intestazione.
        Qui si tolgono entrambe: il bordo, che annidato darebbe un riquadro
        dentro un riquadro; e il titolo, che e' gia' quello su cui si e'
        appena cliccato — ripeterlo occupa spazio e fa leggere due volte la
        stessa riga.
      */}
      <div className="px-5 pb-5 [&>*]:border-0 [&>*]:bg-transparent [&>*]:p-0 [&_[data-compass-heading]]:hidden">
        {children}
      </div>
    </details>
  );
}

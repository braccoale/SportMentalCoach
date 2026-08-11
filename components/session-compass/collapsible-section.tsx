'use client';

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Un blocco della Panoramica che si può richiudere.
 *
 * La Panoramica era diventata quindici blocchi tutti con lo stesso peso
 * visivo, e questo comunica una cosa precisa: **decidi tu cosa conta**. Che è
 * esattamente il lavoro che il riepilogo dovrebbe aver già fatto. Un cruscotto
 * che mostra tutto allo stesso modo non è un cruscotto, è un archivio.
 *
 * Niente viene rimosso: cambia solo cosa si vede aprendo la pagina. Restano
 * aperti la fascia della conversazione — che è anche il colpo d'occhio — la
 * lettura AI e il follow-up; il resto è a un clic, con l'intestazione sempre
 * visibile così si sa che c'è.
 *
 * `<details>` nativo di proposito: nessuno stato da gestire, funziona senza
 * JavaScript, e il browser si occupa da solo di tastiera e accessibilità.
 */
export function CollapsibleSection({
  eyebrow,
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  /** Sopratitolo breve e maiuscolo, come nel resto della Panoramica. */
  eyebrow?: string;
  title: string;
  /** Cosa c'è dentro, per chi decide se aprirlo: «2 momenti», «1 tema». */
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
      {/* Il contenuto arriva con la sua superficie: qui si toglie solo il
          bordo doppio che si creerebbe annidando due riquadri. */}
      <div className="px-5 pb-5 [&>*]:border-0 [&>*]:bg-transparent [&>*]:p-0">
        {children}
      </div>
    </details>
  );
}

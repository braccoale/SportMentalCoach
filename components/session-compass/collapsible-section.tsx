'use client';

import { type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCollapsibleMemory } from '@/lib/hooks/use-collapsible-memory';

/** `kaipai-compass-section-<id>`, come le altre preferenze locali. */
const storageKeyFor = (id: string) => `kaipai-compass-section-${id}`;

/**
 * Un blocco della Panoramica che si può richiudere.
 *
 * Aprendo la pagina i blocchi sono **aperti**: il riepilogo si legge
 * scorrendo, non aprendo quattro pannelli uno per uno per scoprire cosa
 * contengono. Un titolo con dentro un'anteprima nascosta costringe a cliccare
 * per sapere se valeva la pena cliccare.
 *
 * Resta il richiudere — e con `persistKey` la scelta sopravvive alla pagina:
 * chi chiude «Da riascoltare» lo ritrova chiuso alla seduta dopo. Come lo
 * ricorda, e cosa costa, sta in `useCollapsibleMemory`: la stessa memoria che
 * usano i blocchi dell'amministrazione, così le due schermate non finiscono
 * con due regole diverse per la stessa domanda.
 *
 * `<details>` nativo di proposito: nessuno stato React da gestire, funziona
 * senza JavaScript, e il browser si occupa da solo di tastiera e
 * accessibilità.
 */
export function CollapsibleSection({
  eyebrow,
  title,
  hint,
  defaultOpen = true,
  persistKey,
  children,
}: {
  /** Sopratitolo breve e maiuscolo, come nel resto della Panoramica. */
  eyebrow?: string;
  title: string;
  /** Cosa c'è dentro, per chi decide se richiuderlo: «2 momenti», «1 tema». */
  hint?: string;
  defaultOpen?: boolean;
  /**
   * Identificatore stabile del blocco. Stabile: non il titolo, che per il
   * racconto cambia a ogni seduta. Senza, il blocco non ricorda nulla.
   */
  persistKey?: string;
  children: ReactNode;
}) {
  // Il ripristino avviene dopo l'idratazione: un blocco richiuso si vede
  // aperto per un fotogramma. È il prezzo di servire la pagina dal server
  // senza uno script bloccante nell'head, e riguarda solo i blocchi che il
  // coach ha chiuso di sua mano.
  const { ref, onToggle } = useCollapsibleMemory(
    persistKey ? storageKeyFor(persistKey) : null
  );

  return (
    <details
      ref={ref}
      open={defaultOpen}
      onToggle={onToggle}
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

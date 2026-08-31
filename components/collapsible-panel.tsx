'use client';

import { type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useCollapsibleMemory } from '@/lib/hooks/use-collapsible-memory';

/** `kaipai-panel-<id>`, come le altre preferenze locali. */
const storageKeyFor = (id: string) => `kaipai-panel-${id}`;

/**
 * Un blocco di pagina che si apre e si richiude, con il conteggio nel titolo.
 *
 * Nasce per l'amministrazione, che era una pagina sola lunga come sei elenchi
 * messi in fila: per arrivare ai coach da approvare bisognava scorrere oltre
 * tutti gli atleti registrati. Richiudere un elenco non è decorazione, è
 * l'unico modo di far stare in uno schermo le cose su cui si lavora davvero.
 *
 * Il conteggio sta **nell'intestazione**, non dentro: un blocco chiuso deve
 * dire cosa contiene, altrimenti si apre per scoprire se valeva la pena
 * aprirlo. Per la stessa ragione i blocchi arrivano aperti — si richiude quel
 * che non serve, e con `persistKey` la scelta resta anche dopo un ricarico.
 *
 * `<details>` nativo: niente stato React, tastiera e ruolo di apertura già
 * gestiti dal browser, e la ricerca del browser (`Ctrl+F`) trova comunque il
 * testo dei blocchi chiusi nei browser che implementano `hidden=until-found`.
 */
export function CollapsiblePanel({
  title,
  count,
  hint,
  defaultOpen = true,
  persistKey,
  size = 'section',
  children,
}: {
  title: string;
  /** Quanti elementi ci sono dentro: è ciò che rende leggibile un blocco chiuso. */
  count?: number;
  /** Una precisazione breve accanto al conteggio: «2 in percorso». */
  hint?: string;
  defaultOpen?: boolean;
  /**
   * Identificatore stabile del blocco — non il titolo, che cambia con i
   * conteggi. Senza, il blocco non ricorda nulla.
   */
  persistKey?: string;
  /** `section` per un blocco di primo livello, `inline` per uno annidato. */
  size?: 'section' | 'inline';
  children: ReactNode;
}) {
  const { ref, onToggle } = useCollapsibleMemory(
    persistKey ? storageKeyFor(persistKey) : null
  );
  const isSection = size === 'section';

  return (
    <details
      ref={ref}
      open={defaultOpen}
      onToggle={onToggle}
      className={
        isSection
          ? 'group mt-8 min-w-0'
          : 'group min-w-0 rounded-lg border border-gray-200 bg-gray-50/60'
      }
    >
      <summary
        className={`flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 [&::-webkit-details-marker]:hidden ${
          isSection
            ? 'border-b border-gray-200 pb-2'
            : 'rounded-lg px-3 py-2 hover:bg-gray-100'
        }`}
      >
        <ChevronRight
          aria-hidden="true"
          className={`shrink-0 text-gray-400 transition-transform group-open:rotate-90 ${
            isSection ? 'size-5' : 'size-4'
          }`}
        />
        {isSection ? (
          <h2 className="text-lg font-medium text-gray-900">{title}</h2>
        ) : (
          <span className="text-sm font-semibold text-gray-800">{title}</span>
        )}
        {count != null && (
          <span
            className={`rounded-full bg-gray-100 font-semibold text-gray-600 ${
              isSection ? 'px-2.5 py-0.5 text-xs' : 'px-2 py-0.5 text-[11px]'
            }`}
          >
            {count}
          </span>
        )}
        {/* Non `truncate`: un'anteprima tagliata a metà data («il primo 3 set
            2…») nasconde proprio il dato per cui esiste. Va a capo. */}
        {hint && (
          <span className="text-xs font-medium text-gray-500">{hint}</span>
        )}
      </summary>
      <div className={isSection ? 'mt-3' : 'px-3 pb-3'}>{children}</div>
    </details>
  );
}

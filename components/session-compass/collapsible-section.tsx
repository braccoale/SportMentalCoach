'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

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
 * chi chiude «Da riascoltare» lo ritrova chiuso alla seduta dopo. La memoria
 * sta in `localStorage`, cioè in questo browser: una lettura sincrona al
 * mount, nessuna chiamata di rete, nessuna riga in tabella. Il ritardo non è
 * misurabile, ma la scelta non segue il coach su un altro computer — se un
 * giorno dovrà, il posto giusto sono le preferenze utente, non questo file.
 *
 * `<details>` nativo di proposito: nessuno stato React da gestire, funziona
 * senza JavaScript, e il browser si occupa da solo di tastiera e
 * accessibilità. Anche il ripristino scrive direttamente su `open` via ref:
 * mettere lo stato in React vorrebbe dire ri-renderizzare tutto il contenuto
 * del blocco per un attributo che il browser sa già gestire.
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
  const ref = useRef<HTMLDetailsElement>(null);

  // Il ripristino avviene dopo l'idratazione: un blocco richiuso si vede
  // aperto per un fotogramma. È il prezzo di servire la pagina dal server
  // senza uno script bloccante nell'head, e riguarda solo i blocchi che il
  // coach ha chiuso di sua mano.
  useEffect(() => {
    if (!persistKey || !ref.current) return;
    try {
      const stored = window.localStorage.getItem(storageKeyFor(persistKey));
      if (stored === 'open' || stored === 'closed') {
        ref.current.open = stored === 'open';
      }
    } catch {
      // localStorage negato (navigazione privata): si resta sul default.
    }
  }, [persistKey]);

  return (
    <details
      ref={ref}
      open={defaultOpen}
      onToggle={(event) => {
        if (!persistKey) return;
        try {
          window.localStorage.setItem(
            storageKeyFor(persistKey),
            event.currentTarget.open ? 'open' : 'closed',
          );
        } catch {
          // Come sopra: non ricordare è meglio che rompere l'apertura.
        }
      }}
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

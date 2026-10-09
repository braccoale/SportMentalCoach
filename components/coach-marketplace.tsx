'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { CoachDetailPanel, type CoachPanelData } from '@/components/coach-detail-panel';
import { cn } from '@/lib/utils';

/**
 * L'elenco dei coach con il pannello dei dettagli.
 *
 * Regola unica: l'hover mostra soltanto un'anteprima (lo fa il CSS della
 * scheda), il clic sulla scheda apre il pannello, un altro clic lo aggiorna,
 * la X o Esc lo chiudono. Il pannello non fa navigazione: la lista resta
 * dov'è, con la sua posizione di scroll.
 *
 * Su desktop (da 1024 px) il pannello è una colonna a destra, fissa mentre si
 * scorre, circa il 35% dello spazio; sotto, una scheda a tutta altezza in
 * basso, perché sul telefono non c'è hover e lo spazio è poco. I pulsanti di
 * prenotazione del pannello non duplicano niente: premono quelli della scheda
 * (`data-coach-action`), quindi flussi, finestre e regole sono gli stessi.
 */

type Selection = {
  selectedId: number | null;
  select: (id: number) => void;
  close: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

function useSelection(): Selection {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('CoachCardShell va dentro CoachMarketplace');
  return ctx;
}

const DESKTOP_QUERY = '(min-width: 1024px)';
function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
const useIsDesktop = () =>
  useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );

export function CoachMarketplace({
  panels,
  children,
}: {
  panels: Record<number, CoachPanelData>;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // L'ultimo coach mostrato resta a schermo durante l'animazione di chiusura.
  const [shownId, setShownId] = useState<number | null>(null);
  const isDesktop = useIsDesktop();

  const select = useCallback((id: number) => {
    setSelectedId(id);
    setShownId(id);
  }, []);
  const close = useCallback(() => setSelectedId(null), []);

  // Esc chiude il pannello su desktop, ma non se è aperta una finestra (prenotazione…).
  useEffect(() => {
    if (!isDesktop || selectedId == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // Una finestra aperta (prenotazione…) ha già gestito Esc: Radix lo
      // annulla (`preventDefault`) in fase di cattura, prima di questo gestore.
      if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isDesktop, selectedId, close]);

  const value = useMemo(() => ({ selectedId, select, close }), [selectedId, select, close]);
  const panel = shownId != null ? panels[shownId] : undefined;
  const open = selectedId != null && !!panels[selectedId];

  return (
    <SelectionContext.Provider value={value}>
      <div
        className={cn(
          'mt-5 lg:grid lg:items-start',
          'lg:transition-[grid-template-columns] lg:duration-[250ms] lg:ease-out motion-reduce:transition-none',
          open && isDesktop
            ? 'lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]'
            : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0fr)]'
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">{children}</div>

        {/* `overflow: clip` e non `hidden`: non crea un contenitore di scroll,
            quindi il pannello resta fisso (sticky) rispetto alla finestra. */}
        <aside aria-label="Dettagli del coach" className="hidden min-w-0 lg:block [overflow:clip]">
          <div
            aria-hidden={!(open && isDesktop)}
            className={cn(
              'pl-6 transition-[opacity,transform] duration-[250ms] ease-out motion-reduce:transition-none lg:sticky lg:top-24',
              open && isDesktop ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-4 opacity-0'
            )}
          >
            {panel && isDesktop && (
              <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-3xl border border-gray-100 bg-white shadow-lg">
                {/* La chiave cambia alla chiusura: il pannello resta a schermo per
                    l'animazione ma si rimonta, quindi un video in corso si ferma. */}
                <CoachDetailPanel key={`${panel.providerId}-${open ? 'aperto' : 'chiuso'}`} data={panel} onClose={close} />
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Telefono e tablet: scheda a tutta larghezza dal basso. La X di Radix è la chiusura. */}
      <Dialog open={!isDesktop && open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[92dvh] max-lg:bottom-0 max-lg:left-0 max-lg:top-auto max-lg:h-[92dvh] max-lg:w-full max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-b-none max-lg:rounded-t-3xl p-0">
          <DialogTitle className="sr-only">{panel ? `Dettagli di ${panel.name}` : 'Dettagli del coach'}</DialogTitle>
          {panel && <CoachDetailPanel key={panel.providerId} data={panel} onClose={undefined} sheet closeAfterAction={close} />}
        </DialogContent>
      </Dialog>
    </SelectionContext.Provider>
  );
}

/**
 * Avvolge una scheda del coach: la rende selezionabile con il clic, evidenzia
 * quella scelta e lascia stare i pulsanti e i link interni (prenotazione,
 * messaggi, preferiti, condividi), che mantengono il loro comportamento.
 */
export function CoachCardShell({ providerId, children }: { providerId: number; children: ReactNode }) {
  const { selectedId, select } = useSelection();
  const selected = selectedId === providerId;

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    // Le finestre aperte dai pulsanti della scheda stanno in un portale: per
    // React i loro clic risalgono fin qui, ma non sono clic sulla scheda.
    if (!e.currentTarget.contains(target)) return;
    const interactive = target.closest('button, a, input, select, textarea, label, [role="button"], [role="switch"]');
    if (interactive) {
      // L'unico link che apre il pannello: quello del profilo sulla scheda. Con
      // Ctrl/Cmd/Maiusc o il tasto centrale conserva il suo comportamento (nuova scheda).
      const profileLink = target.closest('a[data-profile-link]');
      const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
      if (profileLink && !modified) {
        // In fase di cattura e fermando l'evento: il link di Next parte prima
        // di un gestore normale e avrebbe già avviato la navigazione.
        e.preventDefault();
        e.stopPropagation();
        select(providerId);
      }
      return;
    }
    select(providerId);
  }

  return (
    <div
      onClickCapture={onClick}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      className="cursor-pointer rounded-3xl transition-shadow duration-200 data-[selected=true]:ring-2 data-[selected=true]:ring-emerald-500 data-[selected=true]:ring-offset-2 data-[selected=true]:ring-offset-gray-100 motion-reduce:transition-none"
    >
      {children}
    </div>
  );
}

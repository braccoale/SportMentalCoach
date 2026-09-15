'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { Popover } from 'radix-ui';
import { X } from 'lucide-react';
import { TOUR_CATALOG, type TourKey } from '@/lib/core/tours/catalog';
import { markTourSeenAction } from '@/lib/core/tours/actions';

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Stato del bersaglio di uno step, distinto in tre casi che vanno trattati
 * diversamente:
 *
 * - `'pending'`: non si sa ancora — non ancora misurato, oppure presente nel
 *   DOM ma nascosto (`display:none`), quindi potenzialmente destinato a
 *   comparire più avanti.
 * - `'absent'`: si è aspettato abbastanza e non è mai comparso — si rinuncia
 *   a questo step.
 * - `Rect`: trovato e misurato.
 *
 * Confondere "non ancora guardato" con "guardato e assente" (entrambi `null`
 * in una versione precedente) farebbe saltare o chiudere il tour un attimo
 * prima che la misura reale arrivi.
 */
type TargetState = 'pending' | 'absent' | Rect;

function isRect(state: TargetState): state is Rect {
  return state !== 'pending' && state !== 'absent';
}

// Diversi bersagli di questo tour compaiono solo dopo un'azione dell'utente
// (il pulsante "Entra" nella pre-join screen della videochiamata monta la UI
// reale della call solo al click) o dopo un fetch lato client (il pannello
// del riepilogo AI). Il bersaglio va quindi ri-cercato, non solo controllato
// una volta al mount. Il limite di tempo evita di osservare il DOM per
// sempre quando il bersaglio non comparirà mai (es. un tour aperto su una
// pagina dove quello step non si applica).
//
// Il bound giusto dipende da *quale* step: il primo step di un tour può
// essere montato prima che la UI reale esista — i due tour della
// videochiamata (coach_video_call, athlete_video_call) montano al load della
// pagina, ma il loro bersaglio (`.lk-control-bar`,
// `[data-tour="coach-start-transcription"]`) compare solo dopo che l'utente
// ha superato la pre-join screen (controllo di camera/microfono), che può
// durare ben più di qualche secondo. 90s è un tetto generoso per quel
// passaggio, non per "quanto deve aspettare un suggerimento di UI".
//
// Uno step successivo, raggiunto con "Avanti" mentre il tour è già visibile,
// è un caso diverso: l'utente è impegnato in quel momento, e un'attesa lunga
// e silenziosa si legge come un tour rotto. Lì basta un bound breve, che
// assorbe un tick di render/layout ma non lascia il popover sparito a lungo.
const WATCH_TIMEOUT_MS_FIRST_STEP = 90_000;
const WATCH_TIMEOUT_MS_LATER_STEP = 1_500;

/**
 * Misura l'elemento solo se è realmente visibile. `offsetParent === null` è
 * il modo più robusto per riconoscere un elemento `display:none` (più
 * affidabile di un rect a zero, che un elemento legittimamente 0×0 potrebbe
 * produrre solo transitoriamente); si controlla comunque anche il rect a
 * scopo di difesa ulteriore. Un bersaglio presente nel DOM ma nascosto (es.
 * dietro un `hidden … sm:block` responsive) deve continuare a essere trattato
 * come "non ancora trovato", non ancorare l'highlight nell'angolo in alto a
 * sinistra del viewport.
 */
function measure(el: HTMLElement): Rect | null {
  if (el.offsetParent === null) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Il bersaglio di uno step vive in un altro punto dell'albero React (un
 * bottone dentro un'altra card, non un figlio di questo componente): non è
 * possibile usare `Popover.Anchor` nel modo consueto (avvolgere il
 * bersaglio). Si crea invece un "ancora proxy" — un div invisibile
 * posizionato esattamente sul rettangolo del bersaglio reale, aggiornato ad
 * ogni scroll/resize — e si ancora il popover a quello.
 */
function useTargetRect(selector: string | null, timeoutMs: number): TargetState {
  const [state, setState] = useState<TargetState>('pending');

  useLayoutEffect(() => {
    if (!selector) {
      setState('absent');
      return;
    }
    setState('pending');
    const sel = selector;

    let stopped = false;
    let mutationObserver: MutationObserver | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let trackingCleanup: (() => void) | null = null;

    function stopWatching() {
      mutationObserver?.disconnect();
      mutationObserver = null;
      window.removeEventListener('resize', onWindowResize);
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    // Trovato e visibile: si smette di cercare e si passa a inseguire
    // scroll/resize sull'elemento, come faceva l'implementazione originale.
    function trackFound(el: HTMLElement) {
      stopWatching();
      const update = () => {
        const r = measure(el);
        // Se il bersaglio torna a nascondersi dopo essere stato trovato non
        // si regredisce a 'pending': è un caso limite che questo tour non
        // deve inseguire — si resta sull'ultima misura valida.
        if (r) setState(r);
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
      trackingCleanup = () => {
        ro.disconnect();
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('resize', update);
      };
    }

    // Ritorna true se trovato (e a quel punto ha già iniziato a inseguirlo).
    function check(): boolean {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return false;
      const r = measure(el);
      if (!r) return false; // presente ma nascosto: si continua a guardare
      trackFound(el);
      return true;
    }

    function onWindowResize() {
      if (stopped) return;
      // Un `hidden … sm:block` diventa visibile per via del breakpoint, non
      // di una mutazione del DOM: il MutationObserver da solo non lo vede.
      check();
    }

    function giveUp() {
      if (stopped) return;
      stopped = true;
      stopWatching();
      setState('absent');
    }

    if (check()) {
      return () => {
        stopped = true;
        trackingCleanup?.();
      };
    }

    // Nessun tetto sul numero di mutazioni osservate: su una call LiveKit
    // attiva, class/style cambiano di continuo (indicatori di livello audio,
    // stato di connessione…), e contarle come "costo" da limitare confondeva
    // il tour proprio sulla pagina dove aspettare conta di più. Ogni
    // invocazione qui dentro fa solo una querySelector + confronto — costo
    // trascurabile anche a ripetizione — e l'observer si disconnette al
    // termine dell'effetto (unmount o cambio selector), quindi non c'è un
    // vero rischio di leak da tenere sotto controllo con un contatore.
    mutationObserver = new MutationObserver(() => {
      if (stopped) return;
      check();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    window.addEventListener('resize', onWindowResize);
    timeoutId = setTimeout(giveUp, timeoutMs);

    return () => {
      stopped = true;
      stopWatching();
      trackingCleanup?.();
    };
  }, [selector, timeoutMs]);

  return state;
}

export function ProductTour({
  tourKey,
  alreadySeen,
}: {
  tourKey: TourKey;
  alreadySeen: boolean;
}) {
  const steps = TOUR_CATALOG[tourKey].steps;
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(alreadySeen);
  const step = dismissed ? undefined : steps[stepIndex];
  // Solo il primo step di un tour può legittimamente dover aspettare a lungo
  // (es. la pre-join screen della videochiamata); uno step raggiunto con
  // "Avanti" a tour già visibile usa un bound breve — vedi i commenti sulle
  // due costanti sopra.
  const targetState = useTargetRect(
    step?.target ?? null,
    stepIndex === 0 ? WATCH_TIMEOUT_MS_FIRST_STEP : WATCH_TIMEOUT_MS_LATER_STEP
  );

  // Se il bersaglio dello step corrente risulta definitivamente assente
  // (non "non ancora trovato"), prova il prossimo step; se non ne resta
  // nessuno, il tour non parte. 'pending' non deve mai far scattare questo
  // salto: è solo "non ancora misurato / non ancora comparso".
  useEffect(() => {
    if (dismissed || !step || targetState !== 'absent') return;
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      setDismissed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo quando cambia lo stato del bersaglio
  }, [targetState, dismissed, stepIndex]);

  function finish(status: 'skipped' | 'completed') {
    setDismissed(true);
    void markTourSeenAction(tourKey, status);
  }

  function next() {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      finish('completed');
    }
  }

  if (dismissed || !step || !isRect(targetState)) return null;
  const rect = targetState;

  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        // Radix gestisce Escape e il click fuori solo se ascoltiamo questo
        // callback: senza, un utente da tastiera non ha modo di chiudere il
        // tour se non tabbando fino a "Salta il tour".
        if (!open) finish('skipped');
      }}
    >
      <Popover.Anchor asChild>
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            pointerEvents: 'none',
            // Deve restare sopra qualunque overlay su cui questo tour possa
            // trovarsi — il più alto fra i 7 punti di integrazione è il
            // banner "modalità demo" (demo-readonly-boundary, z-[120]),
            // seguito dai dialog dell'app (fino a z-[110]); il contenuto del
            // popover stesso è z-[100], quindi l'anello deve arrivare almeno
            // fin lì per non restarci sotto.
            zIndex: 130,
          }}
          className="rounded-lg ring-2 ring-indigo-500 ring-offset-2"
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          collisionPadding={12}
          sideOffset={10}
          // Il tour è un suggerimento non bloccante che può apparire mentre
          // l'utente sta facendo altro sulla pagina: non gli si ruba il
          // focus di default.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(event) => {
            // Radix considera "outside" qualunque pointerdown non dentro
            // Popover.Content — incluso il bersaglio reale che il tour sta
            // evidenziando, dato che non è un discendente del content. Se
            // l'utente sta letteralmente cliccando l'elemento che il tour
            // gli sta indicando (es. "Nuovo appuntamento"), non è un click
            // fuori: si lascia che il click raggiunga il bersaglio e faccia
            // quello che ha sempre fatto, senza chiudere il tour. Si
            // ri-interroga il DOM invece di riusare la ref del proxy anchor,
            // perché il proxy ha `pointer-events: none` e non è mai lui il
            // target reale dell'evento.
            const targetSelector = step?.target;
            const anchorEl = targetSelector
              ? document.querySelector<HTMLElement>(targetSelector)
              : null;
            const clickedNode = event.target;
            if (
              anchorEl &&
              clickedNode instanceof Node &&
              (clickedNode === anchorEl || anchorEl.contains(clickedNode))
            ) {
              event.preventDefault();
            }
          }}
          className="z-[100] w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">
              {step.title}
            </p>
            <button
              type="button"
              aria-label="Chiudi il tour"
              onClick={() => finish('skipped')}
              className="text-gray-400 transition-colors hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-sm text-gray-600">{step.body}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {stepIndex + 1}/{steps.length}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => finish('skipped')}
                className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-700"
              >
                Salta il tour
              </button>
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                {stepIndex === steps.length - 1 ? 'Fatto' : 'Avanti'}
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

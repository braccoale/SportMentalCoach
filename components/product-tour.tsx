'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { Popover } from 'radix-ui';
import { X } from 'lucide-react';
import { TOUR_CATALOG, type TourKey } from '@/lib/core/tours/catalog';
import { markTourSeenAction } from '@/lib/core/tours/actions';

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Il bersaglio di uno step vive in un altro punto dell'albero React (un
 * bottone dentro un'altra card, non un figlio di questo componente): non è
 * possibile usare `Popover.Anchor` nel modo consueto (avvolgere il
 * bersaglio). Si crea invece un "ancora proxy" — un div invisibile
 * posizionato esattamente sul rettangolo del bersaglio reale, aggiornato ad
 * ogni scroll/resize — e si ancora il popover a quello.
 */
function useTargetRect(selector: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      setRect(null);
      return;
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [selector]);

  return rect;
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
  const rect = useTargetRect(step?.target ?? null);

  // Se il bersaglio dello step corrente non esiste nel DOM, prova il
  // prossimo step; se non ne resta nessuno, il tour non parte.
  useEffect(() => {
    if (dismissed || !step || rect) return;
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      setDismissed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo quando cambia il bersaglio trovato
  }, [rect, dismissed, stepIndex]);

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

  if (dismissed || !step || !rect) return null;

  return (
    <Popover.Root open>
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

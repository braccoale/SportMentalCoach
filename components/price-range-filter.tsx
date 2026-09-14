'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Solo il pollice è cliccabile (pointer-events-none sul resto della traccia):
// due <input type="range"> sovrapposti si contenderebbero i click sul resto
// della barra altrimenti. Stile del pollice via varianti arbitrarie Tailwind
// — nessuna dipendenza da styled-jsx, non usato altrove nel progetto.
const RANGE_THUMB_CLASS =
  'pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 [&::-webkit-slider-thumb]:bg-white ' +
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-lg [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-gray-900 [&::-moz-range-thumb]:bg-white ' +
  '[&::-moz-range-track]:bg-transparent';

/**
 * "Prezzo a lezione" — un dropdown con dentro uno slider a doppio cursore,
 * dentro lo stesso <form> GET dei filtri (CoachesFilterForm) che si
 * riapplica a ogni `change`. Un <input type="range"> nativo genera `change`
 * a ogni tick durante il trascinamento in React, non solo al rilascio:
 * qui l'aggiornamento del valore mostrato è locale, e il submit vero parte
 * solo al rilascio (mouse/touch/tastiera), altrimenti trascinare un cursore
 * ricaricherebbe la pagina decine di volte.
 */
export function PriceRangeFilter({
  min,
  max,
  initialMin,
  initialMax,
}: {
  /** Bounds in whole euros. */
  min: number;
  max: number;
  initialMin?: number;
  initialMax?: number;
}) {
  const [open, setOpen] = useState(false);
  const [lo, setLo] = useState(initialMin ?? min);
  const [hi, setHi] = useState(initialMax ?? max);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function commit(form: HTMLFormElement | null | undefined) {
    form?.requestSubmit();
  }

  const label = `${lo}-${hi >= max ? `${hi}+` : hi} €`;
  const loPct = max > min ? ((lo - min) / (max - min)) * 100 : 0;
  const hiPct = max > min ? ((hi - min) / (max - min)) * 100 : 100;

  return (
    <div ref={rootRef} className="relative flex flex-col">
      <span className="text-xs font-medium text-gray-600">Prezzo a lezione</span>
      {/* I valori effettivi viaggiano qui, non nei <input type="range"> —
          quelli restano non controllati dal form (niente `name`) perché a
          ogni tick del trascinamento aggiornerebbero l'URL prima del
          rilascio. */}
      <input type="hidden" name="priceMin" value={lo} />
      <input type="hidden" name="priceMax" value={hi} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`mt-1 flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-left text-sm ${
          open ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300'
        }`}
      >
        <span className="font-semibold text-gray-900">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <p className="text-center text-lg font-bold text-gray-900">{label}</p>
          <div className="relative mt-5 h-5">
            <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-900"
              style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
            />
            <input
              type="range"
              aria-label="Prezzo minimo"
              min={min}
              max={max}
              value={lo}
              onChange={(e) => {
                // Ferma qui: senza stopPropagation, ogni tick del
                // trascinamento farebbe risalire un evento "change" fino al
                // <form> di CoachesFilterForm, che lo riapplicherebbe subito
                // — il submit vero parte solo al rilascio, da onPointerUp.
                e.stopPropagation();
                const next = Math.min(Number(e.target.value), hi);
                setLo(next);
              }}
              onPointerUp={(e) => commit(e.currentTarget.form)}
              onKeyUp={(e) => commit(e.currentTarget.form)}
              className={RANGE_THUMB_CLASS}
            />
            <input
              type="range"
              aria-label="Prezzo massimo"
              min={min}
              max={max}
              value={hi}
              onChange={(e) => {
                e.stopPropagation();
                const next = Math.max(Number(e.target.value), lo);
                setHi(next);
              }}
              onPointerUp={(e) => commit(e.currentTarget.form)}
              onKeyUp={(e) => commit(e.currentTarget.form)}
              className={RANGE_THUMB_CLASS}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-400">
            <span>{min} €</span>
            <span>{max}+ €</span>
          </div>
        </div>
      )}
    </div>
  );
}

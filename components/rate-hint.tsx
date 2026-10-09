'use client';

import {
  positionInBand,
  suggestedPriceForDuration,
  type RateLevel,
} from '@/lib/core/rate-suggestion';

/**
 * Il consiglio sotto il campo prezzo: quanto sarebbe il suggerito per questa
 * durata (con «Usa questo prezzo») e dove cade il prezzo scritto rispetto alla
 * fascia. Toni neutri: sopra la fascia non è un errore, e il prezzo non si
 * cambia mai da solo.
 */
export function RateHint({
  level,
  durationMin,
  price,
  disabled,
  onUse,
}: {
  level: RateLevel | null;
  durationMin: number;
  price: number;
  disabled: boolean;
  onUse: (euros: number) => void;
}) {
  if (!level || !Number.isFinite(durationMin) || durationMin <= 0) return null;
  const suggested = suggestedPriceForDuration(level.suggested, durationMin);
  const position = positionInBand(price, durationMin, level);
  const band = `${level.min}–${level.max} €/ora`;
  const note =
    position === 'above'
      ? `Sopra la fascia del tuo livello (${level.label}: ${band}). Va bene se hai un motivo, per esempio una specializzazione rara.`
      : position === 'below'
        ? `Sotto la fascia del tuo livello (${level.label}: ${band}). Puoi alzarlo quando le richieste crescono.`
        : position === 'within'
          ? `In linea con il tuo livello (${level.label}: ${band}).`
          : null;
  return (
    <div className="mt-1.5 text-xs text-gray-500">
      <p>
        Suggerito per {durationMin} minuti: <strong>{suggested} €</strong>.{' '}
        <button
          type="button"
          onClick={() => onUse(suggested)}
          disabled={disabled}
          className="text-gray-700 underline underline-offset-2 hover:text-gray-900 disabled:opacity-50"
        >
          Usa questo prezzo
        </button>
      </p>
      {note && <p className="mt-0.5">{note}</p>}
    </div>
  );
}

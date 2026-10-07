'use client';

import {
  CalendarCheck,
  CalendarClock,
  CalendarX2,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { Hint } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Gli stati di una seduta, con lo stesso colore dappertutto: nella barra delle
 * sedute del mese, nell'elenco delle sedute singole e nelle legende.
 *
 *  - fatta          → verde pieno (è fatta, non cambia più);
 *  - pianificata    → blu (c'è una prenotazione, richiesta o confermata);
 *  - da pianificare → grigio con bordo tratteggiato (ancora da prenotare);
 *  - scaduta        → ambra (non si userà più).
 */
export type SessionKind = 'done' | 'planned' | 'toPlan' | 'expired';

export const SESSION_KIND_STYLE: Record<
  SessionKind,
  { segment: string; dot: string; chip: string }
> = {
  done: {
    segment: 'bg-emerald-600',
    dot: 'bg-emerald-600',
    chip: 'bg-emerald-100 text-emerald-800',
  },
  planned: {
    segment: 'bg-blue-500',
    dot: 'bg-blue-500',
    chip: 'bg-blue-100 text-blue-800',
  },
  toPlan: {
    segment: 'border border-dashed border-gray-400 bg-gray-100',
    dot: 'border border-dashed border-gray-400 bg-gray-100',
    chip: 'bg-gray-100 text-gray-700',
  },
  expired: {
    segment: 'bg-amber-300',
    dot: 'bg-amber-400',
    chip: 'bg-amber-100 text-amber-800',
  },
};

export type SessionSegment = { kind: SessionKind; tooltip: string };

/** Una barra con un segmento per seduta, ognuno col suo suggerimento. */
export function SessionStateBar({ segments }: { segments: SessionSegment[] }) {
  return (
    <span className="flex gap-1" role="list" aria-label="Stato delle sedute">
      {segments.map((segment, index) => (
        <Hint key={index} content={segment.tooltip}>
          <span
            role="listitem"
            tabIndex={0}
            aria-label={segment.tooltip}
            className={cn(
              'h-2.5 flex-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
              SESSION_KIND_STYLE[segment.kind].segment
            )}
          />
        </Hint>
      ))}
    </span>
  );
}

export type SessionLegendItem = {
  kind: SessionKind;
  count: number;
  /** «1 fatta» / «2 fatte»: la frase la compone il chiamante. */
  label: string;
  tooltip: string;
};

/** Una riga con un numero e un colore per stato, ognuno spiegato da un suggerimento. */
export function SessionStateLegend({ items }: { items: SessionLegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
      {items.map((item) => (
        <li key={item.kind}>
          <Hint content={item.tooltip}>
            <span
              tabIndex={0}
              className={cn(
                'inline-flex cursor-help items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
                item.count === 0 && 'text-gray-400'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  SESSION_KIND_STYLE[item.kind].dot
                )}
              />
              <span className="font-semibold text-gray-900">{item.count}</span>
              <span className={item.count === 0 ? 'text-gray-400' : 'text-gray-700'}>
                {item.label}
              </span>
            </span>
          </Hint>
        </li>
      ))}
    </ul>
  );
}

const CHIP_ICON: Record<SessionKind, LucideIcon> = {
  done: CalendarCheck,
  planned: CalendarClock,
  toPlan: Ticket,
  expired: CalendarX2,
};

/** L'etichetta di stato di una seduta, con l'icona e il suggerimento. */
export function StateChip({
  kind,
  label,
  tooltip,
}: {
  kind: SessionKind;
  label: string;
  tooltip: string;
}) {
  const Icon = CHIP_ICON[kind];
  return (
    <Hint content={tooltip}>
      <span
        tabIndex={0}
        className={cn(
          'inline-flex cursor-help items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-600',
          SESSION_KIND_STYLE[kind].chip
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
    </Hint>
  );
}

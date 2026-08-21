import Link from 'next/link';
import { Calendar, Check, ChevronDown } from 'lucide-react';
import {
  JOURNEY_PERIODS,
  JOURNEY_PERIOD_LABELS,
  type JourneyPeriod,
} from '@/lib/core/ai-session-notes/journey-period';

/**
 * Il selettore della finestra temporale.
 *
 * È un `<details>` e non un menu costruito a mano: si apre, si chiude e si
 * usa da tastiera senza una riga di JavaScript, e la pagina resta interamente
 * renderizzata dal server. Le voci sono collegamenti, perché il periodo vive
 * nell'indirizzo: un percorso guardato a tre mesi si può mandare a qualcuno,
 * ricaricare e tenere aperto in una scheda.
 */
export function JourneyPeriodSelect({
  value,
  basePath,
}: {
  value: JourneyPeriod;
  /** Il percorso della pagina, senza parametri: il periodo è l'unico che aggiunge. */
  basePath: string;
}) {
  return (
    /*
     * `key`: dopo una scelta la navigazione è morbida, React tiene lo stesso
     * nodo e il menu resterebbe aperto sopra la pagina appena aggiornata.
     * Cambiando chiave con il periodo il `<details>` viene rimontato, quindi
     * chiuso — senza rinunciare alla navigazione morbida e senza una riga di
     * JavaScript per chiuderlo a mano.
     */
    <details key={value} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <Calendar className="h-4 w-4 text-gray-400" aria-hidden="true" />
        {JOURNEY_PERIOD_LABELS[value]}
        <ChevronDown
          className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <ul className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
        {JOURNEY_PERIODS.map((period) => {
          const selected = period === value;
          return (
            <li key={period}>
              <Link
                href={period === 'tutto' ? basePath : `${basePath}?periodo=${period}`}
                aria-current={selected ? 'true' : undefined}
                className={`flex items-center justify-between gap-2 px-3.5 py-2 text-sm transition hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none ${
                  selected ? 'font-semibold text-gray-900' : 'text-gray-600'
                }`}
              >
                {JOURNEY_PERIOD_LABELS[period]}
                {selected && (
                  <Check className="h-4 w-4 text-violet-600" aria-hidden="true" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

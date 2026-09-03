/**
 * Come si scrive un punto della serie temporale.
 *
 * Modulo a sé perché il grafico è un componente client con dentro recharts, e
 * questa è l'unica parte che vale la pena provare: l'etichetta di un mese è
 * esattamente il genere di stringa che `Intl` rende diversa fra la macchina di
 * sviluppo e il runner di CI, dove l'ICU è ridotta. Scritta a mano, è la
 * stessa ovunque.
 */

import { MONTH_LABELS_SHORT } from '@/lib/core/format';

/**
 * `YYYY-MM-DD` → `30/06`. `YYYY-MM` → `giu 26`.
 *
 * La forma dell'etichetta dice da sola la granularità: chi guarda non deve
 * ricordarsi quale periodo aveva scelto per capire se una barra è un giorno o
 * un mese.
 */
export function seriesBucketLabel(bucket: string): string {
  const [year, month, day] = bucket.split('-');
  if (day) return `${day}/${month}`;
  const nome = MONTH_LABELS_SHORT[Number(month) - 1];
  return nome ? `${nome} ${year.slice(2)}` : bucket;
}

/**
 * Che cosa significa «attivo», scritto una volta sola.
 *
 * La distinzione fra *totale* e *attivo* è la sola che rende utile un KPI di
 * utenti: 40 coach registrati e 6 che hanno tenuto una seduta questa
 * settimana sono due prodotti diversi, e un cruscotto che mostra solo il
 * primo numero racconta il migliore dei due.
 *
 * La definizione vive qui, in chiaro, perché il rischio non è sbagliarla: è
 * averne tre. Una nella query dei coach, una in quella degli atleti, e una
 * nel testo del tooltip — che è il modo in cui un cruscotto comincia a
 * contraddirsi.
 *
 * **Attivo = ha una seduta reale nel periodo.** Reale significa: confermata o
 * conclusa, e collocata nel periodo dall'istante in cui è davvero cominciata
 * quando c'è, altrimenti dall'orario per cui era fissata. Non basta essersi
 * registrati, non basta avere un profilo, non basta aver chiesto: una
 * richiesta mai accettata non è attività, è un tentativo.
 */

/** Gli stati che valgono come seduta reale. */
export const ACTIVE_BOOKING_STATUSES = ['accepted', 'completed'] as const;

/** La frase da mostrare accanto al numero, perché nessuno debba indovinarla. */
export const ACTIVE_DEFINITION =
  'Con almeno una seduta confermata o conclusa nel periodo.';

export const TOTAL_DEFINITION =
  'Tutti gli account registrati, dall’inizio, indipendentemente dall’attività.';

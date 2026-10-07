/**
 * Le condizioni di un percorso mensile, così come si leggono prima di pagare.
 *
 * **Un'unica fonte.** La scheda, la finestra dalla lista e, più avanti, i
 * controlli veri leggono da qui. Una condizione compare con il suo testo solo
 * quando il prodotto la sa mantenere; finché non è decisa o non è costruita
 * vale `null` e la schermata scrive «Da definire». Scrivere una promessa che
 * il sistema non applica (per esempio «disdici quando vuoi» senza il pulsante
 * per farlo) è una promessa falsa a chi sta per pagare.
 *
 * Quando una voce diventa vera, si scrive qui il testo e si aggiorna il test:
 * non si tocca nessuna schermata.
 *
 * Modulo puro.
 */

export type PlanTermKey =
  | 'pagamento'
  | 'rinnovo'
  | 'annullamento'
  | 'utilizzo_sedute'
  | 'sedute_residue'
  | 'disdetta_seduta'
  | 'cambio_piano'
  | 'cambio_coach'
  | 'rimborsi_recesso';

export type PlanTerm = {
  key: PlanTermKey;
  title: string;
  /** `null` = non ancora deciso o non ancora costruito. */
  text: string | null;
};

export const UNDEFINED_TERM_LABEL = 'Da definire';

export const PLAN_TERMS: readonly PlanTerm[] = [
  {
    key: 'pagamento',
    title: 'Pagamento',
    text: 'Con carta, su Stripe. L’importo va direttamente al coach.',
  },
  {
    key: 'rinnovo',
    title: 'Rinnovo',
    text: 'Ogni mese, sulla stessa carta, finché non lo annulli.',
  },
  {
    key: 'annullamento',
    title: 'Annullamento',
    text: 'Puoi annullare quando vuoi. L’abbonamento resta attivo fino alla fine del periodo già pagato e dopo non ti viene più addebitato nulla.',
  },
  { key: 'utilizzo_sedute', title: 'Come si usano le sedute', text: null },
  { key: 'sedute_residue', title: 'Sedute non utilizzate', text: null },
  { key: 'disdetta_seduta', title: 'Disdetta di una seduta', text: null },
  { key: 'cambio_piano', title: 'Cambio piano', text: null },
  { key: 'cambio_coach', title: 'Cambio coach', text: null },
  { key: 'rimborsi_recesso', title: 'Rimborsi e recesso', text: null },
];

/** Quante voci hanno già un testo vero (utile ai test e al promemoria). */
export function definedTermCount(): number {
  return PLAN_TERMS.filter((term) => term.text !== null).length;
}

/**
 * Le condizioni di UNA seduta acquistata a parte. Stesse regole di
 * `PLAN_TERMS`: un testo solo per ciò che il prodotto mantiene davvero, il
 * resto «Da definire». La validità di 60 giorni è vera (la scrive il webhook
 * e la rispetta la prenotazione); rimborso e recesso restano da decidere.
 */
export const SINGLE_SESSION_TERMS: readonly PlanTerm[] = [
  {
    key: 'pagamento',
    title: 'Pagamento',
    text: 'Un solo pagamento con carta, su Stripe. L’importo va direttamente al coach. Nessun rinnovo.',
  },
  {
    key: 'utilizzo_sedute',
    title: 'Validità',
    text: 'La seduta si può prenotare entro 60 giorni dal pagamento.',
  },
  { key: 'disdetta_seduta', title: 'Disdetta di una seduta', text: null },
  { key: 'rimborsi_recesso', title: 'Rimborsi e recesso', text: null },
];

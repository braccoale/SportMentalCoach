/**
 * L'esito di un acquisto o di un annullamento, come lo legge l'atleta quando
 * torna da Stripe o da un pulsante.
 *
 * Il testo lo sceglie questo modulo a partire da un **codice chiuso**: il
 * parametro dell'indirizzo non può mai far comparire una frase scritta da
 * altri. I codici sconosciuti diventano un errore generico, non un'eco.
 *
 * Modulo puro.
 */

import {
  CHECKOUT_REFUSAL_MESSAGES,
  type CheckoutRefusal,
} from './checkout-eligibility';

export type PurchaseNotice = {
  tone: 'ok' | 'info' | 'error';
  text: string;
};

export const GENERIC_PURCHASE_ERROR =
  'Non siamo riusciti ad aprire il pagamento. Riprova tra poco.';

export function purchaseNoticeFor(
  code: string | null | undefined,
  context: { subscriptionActive: boolean }
): PurchaseNotice | null {
  if (!code) return null;

  switch (code) {
    case 'ok':
      return context.subscriptionActive
        ? { tone: 'ok', text: 'Abbonamento attivo. Grazie!' }
        : {
            tone: 'info',
            text: 'Pagamento ricevuto: stiamo confermando il tuo abbonamento.',
          };
    case 'annullato':
      return {
        tone: 'info',
        text: 'Pagamento annullato: non ti è stato addebitato nulla.',
      };
    case 'fine-periodo':
      return {
        tone: 'ok',
        text: 'Abbonamento annullato: non verrà più rinnovato e resta attivo fino alla fine del periodo già pagato.',
      };
    case 'riattivato':
      return {
        tone: 'ok',
        text: 'Abbonamento riattivato: continuerà a rinnovarsi ogni mese.',
      };
    default:
      // `hasOwn`, non `in`: «constructor» o «toString» sono nell'oggetto per
      // eredità e non sono codici di rifiuto.
      if (Object.hasOwn(CHECKOUT_REFUSAL_MESSAGES, code)) {
        return {
          tone: 'error',
          text: CHECKOUT_REFUSAL_MESSAGES[code as CheckoutRefusal],
        };
      }
      return { tone: 'error', text: GENERIC_PURCHASE_ERROR };
  }
}

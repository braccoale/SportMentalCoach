/**
 * Come si chiama, nella scheda dell'abbonamento, il metodo di pagamento
 * salvato. Marca e ultime cifre non si conservano da nessuna parte: si
 * leggono da Stripe a ogni apertura e si mostrano, mai si salvano.
 *
 * Ogni tipo conosciuto ha il suo nome; uno che non conosciamo diventa
 * «Metodo di pagamento salvato», senza dettagli: meglio una frase generica che
 * un'etichetta inventata. Senza metodo (Stripe non risponde, o non ce n'è uno)
 * la scheda non mostra il riquadro.
 *
 * Modulo puro.
 */

export type PaymentMethodLike = {
  type?: string | null;
  card?: { brand?: string | null; last4?: string | null } | null;
  sepa_debit?: { last4?: string | null } | null;
};

const DOTS = '••••';

function validLast4(value: string | null | undefined): string | null {
  return value && /^\d{4}$/.test(value) ? value : null;
}

export function paymentMethodLabel(
  method: PaymentMethodLike | null | undefined
): string | null {
  if (!method || !method.type) return null;

  switch (method.type) {
    case 'card': {
      const last4 = validLast4(method.card?.last4);
      return last4 ? `Carta ${DOTS} ${last4}` : 'Carta';
    }
    case 'link':
      return 'Link';
    case 'sepa_debit': {
      const last4 = validLast4(method.sepa_debit?.last4);
      return last4 ? `Addebito SEPA ${DOTS} ${last4}` : 'Addebito SEPA';
    }
    default:
      return 'Metodo di pagamento salvato';
  }
}

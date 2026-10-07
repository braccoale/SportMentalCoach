/**
 * Le etichette della vista admin dei pagamenti, in un modulo puro per poterle
 * verificare: un valore che non conosciamo si mostra com'è, mai vuoto, perché
 * in assistenza un'etichetta sbagliata fa perdere più tempo di un codice
 * grezzo.
 */

const SUBSCRIPTION_STATUS: Record<string, string> = {
  incomplete: 'Non completato',
  active: 'Attivo',
  past_due: 'Pagamento in ritardo',
  canceled: 'Chiuso',
};

const CREDIT_STATUS: Record<string, string> = {
  pending: 'In attesa di pagamento',
  granted: 'Pagata',
  revoked: 'Revocata',
};

const CREDIT_KIND: Record<string, string> = {
  single: 'Singola',
  extra: 'Extra',
};

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

export function subscriptionStatusLabel(status: string, cancelAtPeriodEnd: boolean): string {
  const base = SUBSCRIPTION_STATUS[status] ?? status;
  return status === 'active' && cancelAtPeriodEnd ? `${base} · non si rinnova` : base;
}

export function subscriptionStatusTone(status: string, cancelAtPeriodEnd: boolean): Tone {
  if (status === 'past_due') return 'bad';
  if (status === 'active') return cancelAtPeriodEnd ? 'warn' : 'ok';
  if (status === 'incomplete') return 'warn';
  return 'neutral';
}

export function creditStatusLabel(status: string, bookingId: number | null): string {
  const base = CREDIT_STATUS[status] ?? status;
  return status === 'granted' && bookingId !== null ? `${base} · prenotata` : base;
}

export function creditStatusTone(status: string): Tone {
  if (status === 'granted') return 'ok';
  if (status === 'pending') return 'warn';
  return 'neutral';
}

export function creditKindLabel(kind: string): string {
  return CREDIT_KIND[kind] ?? kind;
}

/**
 * Un abbonamento «non completato» da più di un giorno è un Checkout
 * abbandonato (o un pagamento che non è mai arrivato): in assistenza è la
 * prima ipotesi da controllare.
 */
export function isStaleIncomplete(status: string, updatedAt: Date, now: Date): boolean {
  return (
    status === 'incomplete' &&
    now.getTime() - updatedAt.getTime() > 24 * 60 * 60 * 1000
  );
}

/**
 * Come sta un atleta, dal punto di vista del coach: dov'è con l'abbonamento,
 * quante sedute ha fatto, quante ha pianificato e quante restano, e che cosa
 * richiede attenzione. Serve alla lista «I miei atleti»: con molti atleti il
 * coach deve capire a colpo d'occhio **chi ha bisogno di lui adesso**.
 *
 * Le regole di conteggio sono quelle dell'atleta (`sessionUsageForPeriod`):
 * la stessa seduta non può risultare «fatta» da una parte e «da pianificare»
 * dall'altra.
 *
 * Modulo puro: si prova con un `now` fisso.
 */

import type { SessionUsage } from './session-usage';
import { formatLongDateRome } from './subscription-status';

export type CoachAthleteBilling = {
  plan: {
    name: string;
    sessionsPerMonth: number;
    status: 'active' | 'past_due';
    cancelAtPeriodEnd: boolean;
    /** Fine del periodo pagato (rinnovo o termine). */
    periodEnd: Date | null;
    usage: SessionUsage;
  } | null;
  /** Sedute acquistate a parte, ancora utili. */
  singles: {
    toPlan: number;
    planned: number;
    /** La scadenza più vicina fra quelle da pianificare. */
    nextExpiry: Date | null;
  };
};

export type AthleteSignalCode =
  | 'PAST_DUE'
  | 'RENEWAL_SOON'
  | 'ENDING'
  | 'NOTHING_PLANNED'
  | 'SINGLE_EXPIRING';

export type AthleteSignal = {
  code: AthleteSignalCode;
  /** `warn` chiede un'azione; `info` segnala soltanto. */
  tone: 'warn' | 'info';
  label: string;
  tooltip: string;
};

/** Entro quanti giorni dal rinnovo (o dalla fine) le sedute rimaste diventano un segnale. */
export const RENEWAL_SOON_DAYS = 7;
/** Entro quanti giorni una sessione singola non ancora pianificata è «in scadenza». */
export const SINGLE_EXPIRING_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Giorni interi che mancano, per eccesso; 0 se è già passato. */
export function daysUntil(target: Date, now: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / DAY_MS));
}

function inDays(days: number): string {
  if (days <= 0) return 'oggi';
  if (days === 1) return 'domani';
  return `tra ${days} giorni`;
}

export function athleteBillingSignals(
  billing: CoachAthleteBilling,
  now: Date
): AthleteSignal[] {
  const signals: AthleteSignal[] = [];
  const plan = billing.plan;

  if (plan) {
    if (plan.status === 'past_due') {
      signals.push({
        code: 'PAST_DUE',
        tone: 'warn',
        label: 'Pagamento in ritardo',
        tooltip:
          'L’ultimo pagamento dell’abbonamento non è andato a buon fine: finché non lo sistema non puoi fissare nuove sedute con lui.',
      });
    }

    const end = plan.periodEnd;
    const remaining = plan.usage.known ? plan.usage.remaining : 0;
    const booked = plan.usage.known ? plan.usage.booked : 0;
    const days = end ? daysUntil(end, now) : null;

    if (plan.cancelAtPeriodEnd && end) {
      signals.push({
        code: 'ENDING',
        tone: 'info',
        label: `Termina il ${formatLongDateRome(end)}`,
        tooltip:
          'Ha annullato l’abbonamento: resta attivo fino a quella data e poi non si rinnova.',
      });
    }

    if (plan.usage.known && remaining > 0) {
      if (days !== null && days <= RENEWAL_SOON_DAYS) {
        signals.push({
          code: 'RENEWAL_SOON',
          tone: 'warn',
          label: `${remaining} da pianificare · ${
            plan.cancelAtPeriodEnd ? 'scadono' : 'rinnovo'
          } ${inDays(days)}`,
          tooltip: plan.cancelAtPeriodEnd
            ? 'Le sedute del piano non pianificate si perdono alla fine dell’abbonamento.'
            : 'Le sedute del piano non si riportano al rinnovo: se non vengono pianificate, si perdono.',
        });
      } else if (booked === 0) {
        signals.push({
          code: 'NOTHING_PLANNED',
          tone: 'info',
          label: 'Nessuna seduta pianificata',
          tooltip:
            'Ha sedute del piano da usare in questo periodo ma non ne ha ancora prenotata nessuna.',
        });
      }
    }
  }

  const { toPlan, nextExpiry } = billing.singles;
  if (
    toPlan > 0 &&
    nextExpiry &&
    daysUntil(nextExpiry, now) <= SINGLE_EXPIRING_DAYS
  ) {
    signals.push({
      code: 'SINGLE_EXPIRING',
      tone: 'warn',
      label: `Sessione singola in scadenza il ${formatLongDateRome(nextExpiry)}`,
      tooltip:
        'Ha acquistato una seduta a parte e non l’ha ancora pianificata: dopo la scadenza non si può più prenotare.',
    });
  }

  return signals;
}

/** Il peso di una lista di segnali, per ordinare chi ha più bisogno prima. */
export function signalsAttentionScore(signals: AthleteSignal[]): number {
  return signals.reduce((sum, s) => sum + (s.tone === 'warn' ? 2 : 0), 0);
}

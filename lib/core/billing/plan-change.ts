/**
 * Il cambio piano, dal prossimo rinnovo e senza calcolo proporzionale.
 *
 * Qui si decide **se** si può cambiare e **cosa** succede alla scheda:
 *  - il cambio vale dal rinnovo, quindi non tocca niente di quello che l'atleta
 *    ha già pagato e prenotato in questo periodo;
 *  - si cambia solo tra i piani **attivi dello stesso coach**: un altro coach
 *    è un altro abbonamento (non previsto, per ora);
 *  - con un abbonamento che sta per finire (`cancelAtPeriodEnd`) o con il
 *    pagamento in ritardo non ha senso programmare un piano futuro: prima si
 *    riattiva o si sistema il pagamento;
 *  - un solo cambio alla volta: sceglierne un altro sostituisce il precedente;
 *    scegliere di nuovo il piano attuale lo annulla.
 *
 * Modulo puro. L'unica fonte della regola: la scheda mostra il pulsante solo
 * se `decidePlanChange` dice sì, e l'azione sul server la richiama uguale.
 */

export type ChangeablePlan = {
  id: number;
  coachUserId: number;
  status: string;
};

export type PlanChangeSubscription = {
  status: string;
  cancelAtPeriodEnd: boolean;
  coachUserId: number;
  planId: number;
  pendingPlanId: number | null;
};

export type PlanChangeDecision =
  | { ok: true; action: 'schedule' | 'cancel_pending' }
  | { ok: false; reason: PlanChangeRefusal; message: string };

export type PlanChangeRefusal =
  | 'NOT_ACTIVE'
  | 'PAST_DUE'
  | 'ENDING'
  | 'WRONG_COACH'
  | 'PLAN_UNAVAILABLE'
  | 'SAME_PLAN'
  | 'ALREADY_PENDING';

const MESSAGES: Record<PlanChangeRefusal, string> = {
  NOT_ACTIVE: 'Questo abbonamento non è attivo: non si può cambiare piano.',
  PAST_DUE:
    'Il pagamento dell’abbonamento non è andato a buon fine: sistemalo prima di cambiare piano.',
  ENDING:
    'Il rinnovo è annullato: riattivalo prima di scegliere un altro piano.',
  WRONG_COACH: 'Il piano scelto non è di questo coach.',
  PLAN_UNAVAILABLE: 'Il piano scelto non è più disponibile.',
  SAME_PLAN: 'È già il tuo piano.',
  ALREADY_PENDING: 'Hai già programmato questo cambio.',
};

export function decidePlanChange(
  subscription: PlanChangeSubscription,
  target: ChangeablePlan
): PlanChangeDecision {
  const refuse = (reason: PlanChangeRefusal): PlanChangeDecision => ({
    ok: false,
    reason,
    message: MESSAGES[reason],
  });
  if (subscription.status === 'past_due') return refuse('PAST_DUE');
  if (subscription.status !== 'active') return refuse('NOT_ACTIVE');
  if (subscription.cancelAtPeriodEnd) return refuse('ENDING');
  if (target.coachUserId !== subscription.coachUserId) return refuse('WRONG_COACH');
  if (target.status !== 'active') return refuse('PLAN_UNAVAILABLE');
  if (target.id === subscription.planId) {
    // Tornare al piano attuale vale come annullare il cambio programmato.
    return subscription.pendingPlanId !== null
      ? { ok: true, action: 'cancel_pending' }
      : refuse('SAME_PLAN');
  }
  if (subscription.pendingPlanId === target.id) return refuse('ALREADY_PENDING');
  return { ok: true, action: 'schedule' };
}

/**
 * Può essere mostrata la scelta del piano? (stessa regola, senza un piano
 * bersaglio): vivo, non in ritardo e non in chiusura.
 */
export function canOfferPlanChange(
  subscription: Pick<PlanChangeSubscription, 'status' | 'cancelAtPeriodEnd'>
): boolean {
  return subscription.status === 'active' && !subscription.cancelAtPeriodEnd;
}

/**
 * Il piano in arrivo si applica quando il webhook vede, sull'abbonamento di
 * Stripe, il segno del piano nuovo. `null` se non c'è niente da applicare.
 */
export function planToApplyFromMetadata(
  metadata: Record<string, string> | null | undefined,
  currentPlanId: number
): number | null {
  const raw = metadata?.kaipai_plan_id;
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 && id !== currentPlanId ? id : null;
}

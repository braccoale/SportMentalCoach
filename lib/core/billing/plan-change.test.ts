import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canOfferPlanChange,
  decidePlanChange,
  planToApplyFromMetadata,
} from './plan-change';

const sub = { status: 'active', cancelAtPeriodEnd: false, coachUserId: 83, planId: 1, pendingPlanId: null };
const plan = { id: 2, coachUserId: 83, status: 'active' };

describe('decidePlanChange', () => {
  it('un altro piano attivo dello stesso coach si programma', () => {
    assert.deepEqual(decidePlanChange(sub, plan), { ok: true, action: 'schedule' });
  });
  it('un piano di un altro coach no', () => {
    const r = decidePlanChange(sub, { ...plan, coachUserId: 99 });
    assert.equal(r.ok === false && r.reason, 'WRONG_COACH');
  });
  it('un piano non più attivo no', () => {
    const r = decidePlanChange(sub, { ...plan, status: 'archived' });
    assert.equal(r.ok === false && r.reason, 'PLAN_UNAVAILABLE');
  });
  it('con pagamento in ritardo o rinnovo annullato prima si sistema quello', () => {
    assert.equal(decidePlanChange({ ...sub, status: 'past_due' }, plan).ok, false);
    const r = decidePlanChange({ ...sub, cancelAtPeriodEnd: true }, plan);
    assert.equal(r.ok === false && r.reason, 'ENDING');
  });
  it('un abbonamento chiuso non si cambia', () => {
    const r = decidePlanChange({ ...sub, status: 'canceled' }, plan);
    assert.equal(r.ok === false && r.reason, 'NOT_ACTIVE');
  });
  it('il piano attuale non è un cambio, a meno che ci sia un cambio da annullare', () => {
    const same = { ...plan, id: 1 };
    assert.equal(decidePlanChange(sub, same).ok, false);
    assert.deepEqual(decidePlanChange({ ...sub, pendingPlanId: 2 }, same), {
      ok: true,
      action: 'cancel_pending',
    });
  });
  it('lo stesso cambio già programmato non si ripete; un altro lo sostituisce', () => {
    const pending = { ...sub, pendingPlanId: 2 };
    assert.equal(decidePlanChange(pending, plan).ok, false);
    assert.deepEqual(decidePlanChange(pending, { ...plan, id: 3 }), { ok: true, action: 'schedule' });
  });
});

describe('canOfferPlanChange', () => {
  it('solo per un abbonamento attivo e che si rinnova', () => {
    assert.equal(canOfferPlanChange(sub), true);
    assert.equal(canOfferPlanChange({ ...sub, cancelAtPeriodEnd: true }), false);
    assert.equal(canOfferPlanChange({ ...sub, status: 'past_due' }), false);
  });
});

describe('planToApplyFromMetadata', () => {
  it('applica il piano segnato solo se diverso da quello attuale', () => {
    assert.equal(planToApplyFromMetadata({ kaipai_plan_id: '2' }, 1), 2);
    assert.equal(planToApplyFromMetadata({ kaipai_plan_id: '1' }, 1), null);
  });
  it('ignora segni mancanti o malformati', () => {
    assert.equal(planToApplyFromMetadata({}, 1), null);
    assert.equal(planToApplyFromMetadata(null, 1), null);
    assert.equal(planToApplyFromMetadata({ kaipai_plan_id: 'x' }, 1), null);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AVAILABILITY_PRESETS,
  COACH_WIZARD_STEPS,
  clampWizardStep,
  coachSinceFromYears,
  slotsToAdd,
  yearsFromCoachSince,
} from './coach-wizard';

describe('passi del wizard', () => {
  it('le chiavi sono uniche, si parte da Benvenuto e si finisce al Riepilogo', () => {
    const keys = COACH_WIZARD_STEPS.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(keys[0], 'welcome');
    assert.equal(keys[keys.length - 1], 'review');
  });
  it('un passo salvato fuori dai limiti o strano torna dentro', () => {
    assert.equal(clampWizardStep(undefined), 0);
    assert.equal(clampWizardStep(null), 0);
    assert.equal(clampWizardStep(NaN), 0);
    assert.equal(clampWizardStep(-4), 0);
    assert.equal(clampWizardStep(2.9), 2);
    assert.equal(clampWizardStep(99), COACH_WIZARD_STEPS.length - 1);
  });
});

describe('anni di esperienza e «Coach dal»', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  it('gli anni diventano il primo gennaio di quell’anno, mai una data futura', () => {
    assert.equal(coachSinceFromYears(5, now), '2021-01-01');
    assert.equal(coachSinceFromYears(0, now), '2026-01-01');
    assert.equal(coachSinceFromYears(2.7, now), '2024-01-01');
  });
  it('valori assurdi non producono una data', () => {
    assert.equal(coachSinceFromYears(-1, now), null);
    assert.equal(coachSinceFromYears(200, now), null);
    assert.equal(coachSinceFromYears(NaN, now), null);
  });
  it('l’operazione inversa restituisce gli anni, e ignora ciò che non è una data', () => {
    assert.equal(yearsFromCoachSince('2021-01-01', now), 5);
    assert.equal(yearsFromCoachSince('2015-06-30', now), 11);
    assert.equal(yearsFromCoachSince(null, now), null);
    assert.equal(yearsFromCoachSince('boh', now), null);
    assert.equal(yearsFromCoachSince('2030-01-01', now), null);
  });
});

describe('modelli di orario', () => {
  it('ogni modello ha fasce valide: giorno 0–6, inizio prima della fine, dentro la giornata', () => {
    for (const p of AVAILABILITY_PRESETS) {
      assert.ok(p.slots.length > 0);
      for (const s of p.slots) {
        assert.ok(s.weekday >= 0 && s.weekday <= 6);
        assert.ok(s.startMinute >= 0 && s.endMinute <= 24 * 60 && s.startMinute < s.endMinute);
      }
    }
  });
  it('senza orari esistenti si aggiungono tutte le fasce dei modelli scelti', () => {
    assert.equal(slotsToAdd([], ['sera']).length, 5);
    assert.equal(slotsToAdd([], ['sera', 'weekend']).length, 7);
    assert.equal(slotsToAdd([], ['non-esiste']).length, 0);
  });
  it('rieseguire il passo non crea doppioni né sovrapposizioni', () => {
    const first = slotsToAdd([], ['sera']);
    assert.equal(slotsToAdd(first, ['sera']).length, 0);
    // sera e mattina non si sovrappongono: insieme sono dieci fasce
    assert.equal(slotsToAdd([], ['sera', 'mattina']).length, 10);
    // un orario del coach che copre parte di un modello fa saltare solo quella fascia
    const mine = [{ weekday: 1, startMinute: 17 * 60, endMinute: 19 * 60 }];
    assert.equal(slotsToAdd(mine, ['sera']).length, 4);
  });
});

import { computeCoachOnboarding } from './compute';

describe('requisiti per inviare il profilo in revisione', () => {
  const profile = {
    headline: 'Mental coach',
    description: 'Racconto come lavoro.',
    categories: ['tennis'],
    specialties: ['performance_anxiety'],
    status: 'draft',
  };
  it('con tutto, foto compresa, si può inviare', () => {
    const o = computeCoachOnboarding(profile, 1, true);
    assert.equal(o.canSubmit, true);
    assert.equal(o.nextStep?.key, 'submit');
    assert.equal(o.steps.every((s) => s.key === 'submit' || s.done), true);
  });
  it('senza foto non si può inviare, e il prossimo passo è la foto', () => {
    const o = computeCoachOnboarding(profile, 1, false);
    assert.equal(o.canSubmit, false);
    assert.equal(o.nextStep?.key, 'photo');
  });
  it('senza servizio o senza sport non si può inviare', () => {
    assert.equal(computeCoachOnboarding(profile, 0, true).canSubmit, false);
    assert.equal(computeCoachOnboarding({ ...profile, categories: [] }, 1, true).canSubmit, false);
    assert.equal(computeCoachOnboarding({ ...profile, headline: '  ' }, 1, true).canSubmit, false);
  });
  it('un profilo già inviato o approvato non si invia di nuovo', () => {
    assert.equal(computeCoachOnboarding({ ...profile, status: 'pending' }, 1, true).canSubmit, false);
    assert.equal(computeCoachOnboarding({ ...profile, status: 'approved' }, 1, true).canSubmit, false);
    assert.equal(computeCoachOnboarding({ ...profile, status: 'rejected' }, 1, true).canSubmit, true);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  completenessLevel,
  computeProfileCompleteness,
  type CoachProfileInput,
} from './completeness';

const empty: CoachProfileInput = {
  hasPhoto: false,
  headline: null,
  description: null,
  categories: null,
  specialties: null,
  athleteLevels: null,
  languages: null,
  coachSince: null,
  yearsExperience: null,
  certifications: null,
  certificationsVerified: false,
  hasVideo: false,
  hasService: false,
  hasPricedService: false,
  hasAvailability: false,
  hasIntroSession: false,
};

const full: CoachProfileInput = {
  hasPhoto: true,
  headline: 'Mental coach per tennisti e giovani agonisti',
  description: 'x'.repeat(300),
  categories: ['tennis'],
  specialties: ['ansia', 'concentrazione'],
  athleteLevels: ['agonista'],
  languages: ['it'],
  coachSince: '2018-01-01',
  yearsExperience: null,
  certifications: ['Master in psicologia dello sport'],
  certificationsVerified: true,
  hasVideo: true,
  hasService: true,
  hasPricedService: true,
  hasAvailability: true,
  hasIntroSession: true,
};

describe('computeProfileCompleteness', () => {
  it('i pesi sommano a 100', () => {
    const total = computeProfileCompleteness(full).items.reduce((s, i) => s + i.weight, 0);
    assert.equal(total, 100);
  });
  it('un profilo vuoto vale 0 e un profilo completo 100', () => {
    assert.equal(computeProfileCompleteness(empty).score, 0);
    const c = computeProfileCompleteness(full);
    assert.equal(c.score, 100);
    assert.equal(c.level, 'completo');
    assert.equal(c.nextSteps.length, 0);
  });
  it('una bio breve vale la metà, una lunga il pieno', () => {
    const bio = (n: number) =>
      computeProfileCompleteness({ ...empty, description: 'x'.repeat(n) }).items.find(
        (i) => i.key === 'bio'
      )!;
    assert.equal(bio(50).state, 'missing');
    assert.equal(bio(150).state, 'partial');
    assert.equal(bio(150).earned, 6);
    assert.equal(bio(300).state, 'done');
  });
  it('una sola specialità vale la metà', () => {
    const s = computeProfileCompleteness({ ...empty, specialties: ['ansia'] }).items.find(
      (i) => i.key === 'specialties'
    )!;
    assert.equal(s.earned, 4);
    assert.equal(s.state, 'partial');
  });
  it('i titoli dichiarati valgono, e di più se verificati', () => {
    const dichiarati = computeProfileCompleteness({ ...empty, certifications: ['Master'] });
    const verificati = computeProfileCompleteness({
      ...empty,
      certifications: ['Master'],
      certificationsVerified: true,
    });
    assert.equal(dichiarati.score, 8);
    assert.equal(verificati.score, 12);
    // Verificati ma nessun titolo scritto: niente.
    assert.equal(computeProfileCompleteness({ ...empty, certificationsVerified: true }).score, 0);
  });
  it('il servizio vale metà senza prezzo', () => {
    const s = computeProfileCompleteness({ ...empty, hasService: true }).items.find(
      (i) => i.key === 'service'
    )!;
    assert.equal(s.earned, 4);
  });
  it('stringhe vuote o spazi non contano come informazione', () => {
    const c = computeProfileCompleteness({
      ...empty,
      categories: ['  '],
      languages: [''],
      headline: '   ',
    });
    assert.equal(c.score, 0);
  });
  it('i passi successivi sono quelli che fanno guadagnare di più, al massimo quattro', () => {
    const c = computeProfileCompleteness({ ...empty, hasPhoto: true });
    assert.equal(c.nextSteps.length, 4);
    assert.equal(c.nextSteps[0].key, 'bio'); // 12 punti, il più pesante rimasto
    for (const step of c.nextSteps) assert.notEqual(step.state, 'done');
  });
  it('una voce parziale resta tra i passi con i punti che mancano', () => {
    const c = computeProfileCompleteness({ ...full, description: 'x'.repeat(120) });
    assert.equal(c.nextSteps[0].key, 'bio');
    assert.equal(c.score, 94);
  });
});

describe('completenessLevel', () => {
  it('le soglie sono 40, 70 e 90', () => {
    assert.equal(completenessLevel(0), 'base');
    assert.equal(completenessLevel(39), 'base');
    assert.equal(completenessLevel(40), 'buono');
    assert.equal(completenessLevel(69), 'buono');
    assert.equal(completenessLevel(70), 'ottimo');
    assert.equal(completenessLevel(89), 'ottimo');
    assert.equal(completenessLevel(90), 'completo');
  });
});

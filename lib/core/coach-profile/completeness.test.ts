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
  hasVideo: false,
  hasService: false,
  hasPricedService: false,
  hasAvailability: false,
};

const full: CoachProfileInput = {
  hasPhoto: true,
  headline: 'Mental coach per tennisti e giovani agonisti',
  description: 'x'.repeat(350),
  categories: ['tennis'],
  specialties: ['ansia', 'concentrazione'],
  athleteLevels: ['agonista'],
  languages: ['it'],
  coachSince: '2018-01-01',
  yearsExperience: null,
  certifications: ['Master in psicologia dello sport'],
  hasVideo: true,
  hasService: true,
  hasPricedService: true,
  hasAvailability: true,
};

const item = (input: CoachProfileInput, key: string) =>
  computeProfileCompleteness(input).items.find((i) => i.key === key)!;

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
  it('solo ciò che il coach può fare da solo conta: niente verifica dei titoli né sessione conoscitiva', () => {
    const keys = computeProfileCompleteness(full).items.map((i) => i.key);
    assert.ok(!keys.includes('certifications_verified'));
    assert.ok(!keys.includes('intro'));
  });
  it('la struttura pesa meno del contenuto', () => {
    const items = computeProfileCompleteness(full).items;
    const structure = ['photo', 'sports', 'specialties', 'levels', 'languages', 'service', 'availability'];
    const structureWeight = items.filter((i) => structure.includes(i.key)).reduce((s, i) => s + i.weight, 0);
    assert.equal(structureWeight, 42);
    assert.equal(100 - structureWeight, 58);
  });
  it('una presentazione corta vale metà, una lunga il pieno, una cortissima niente', () => {
    const bio = (n: number) => item({ ...empty, description: 'x'.repeat(n) }, 'bio');
    assert.equal(bio(100).state, 'missing');
    assert.equal(bio(200).state, 'partial');
    assert.equal(bio(200).earned, 9);
    assert.equal(bio(300).state, 'done');
  });
  it('una sola specialità vale metà', () => {
    const s = item({ ...empty, specialties: ['ansia'] }, 'specialties');
    assert.equal(s.earned, 4);
    assert.equal(s.state, 'partial');
  });
  it('basta un servizio attivo: il prezzo non si chiede più', () => {
    assert.equal(item({ ...empty, hasService: true }, 'service').earned, 6);
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
    assert.equal(c.nextSteps[0].key, 'bio'); // 18 punti, il più pesante rimasto
    assert.equal(c.nextSteps[1].key, 'video');
    for (const step of c.nextSteps) assert.notEqual(step.state, 'done');
  });
  it('una voce parziale resta tra i passi con i punti che mancano', () => {
    const c = computeProfileCompleteness({ ...full, description: 'x'.repeat(200) });
    assert.equal(c.nextSteps[0].key, 'bio');
    assert.equal(c.score, 91);
  });
});

// La taratura sui quattro profili veri di ottobre 2026: un profilo con tutta la
// struttura ma presentazione cortissima, niente titoli e niente video NON deve
// risultare «buono» (prima, con i pesi di struttura più alti, arrivava al 61%).
describe('taratura sui profili reali', () => {
  const base = {
    hasPhoto: true,
    athleteLevels: ['a'],
    languages: ['it'],
    coachSince: '2020-01-01',
    yearsExperience: null,
    hasVideo: false,
    hasService: true,
    hasPricedService: true,
    hasAvailability: true,
  };
  it('struttura completa ma contenuto scarso: livello base', () => {
    const scarso = computeProfileCompleteness({
      ...base,
      headline: 'Mental coach',
      description: 'Breve presentazione di una riga.',
      categories: ['a', 'b'],
      specialties: ['x', 'y', 'z'],
      certifications: null,
    });
    assert.equal(scarso.level, 'base');
    assert.ok(scarso.score < 55, `punteggio ${scarso.score}`);
  });
  it('contenuto buono (presentazione, titolo, titoli) senza video: ottimo', () => {
    const buono = computeProfileCompleteness({
      ...base,
      headline: 'Mental coach sportivo per giovani atleti',
      description: 'x'.repeat(420),
      categories: ['a'],
      specialties: ['x', 'y', 'z'],
      certifications: ['Master', 'Corso'],
    });
    assert.equal(buono.level, 'ottimo');
  });
});

describe('completenessLevel', () => {
  it('le soglie sono 55, 75 e 90', () => {
    assert.equal(completenessLevel(0), 'base');
    assert.equal(completenessLevel(54), 'base');
    assert.equal(completenessLevel(55), 'buono');
    assert.equal(completenessLevel(74), 'buono');
    assert.equal(completenessLevel(75), 'ottimo');
    assert.equal(completenessLevel(89), 'ottimo');
    assert.equal(completenessLevel(90), 'completo');
  });
});

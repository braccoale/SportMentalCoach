import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RATE_LEVELS,
  levelForScore,
  positionInBand,
  suggestRate,
  suggestedPriceForDuration,
  type RateInput,
} from './index';

const empty: RateInput = {
  yearsExperience: null,
  totalMinutes: 0,
  athletesCount: 0,
  ratingAverage: null,
  ratingCount: 0,
  certificationsCount: 0,
  certificationsVerified: false,
  athleteLevels: [],
};

describe('suggestRate', () => {
  it('un coach senza dati è al livello Avvio con punteggio 0', () => {
    const s = suggestRate(empty);
    assert.equal(s.score, 0);
    assert.equal(s.level.key, 'avvio');
    assert.equal(s.next?.level.key, 'consolidato');
  });
  it('un coach al massimo su tutto è Senior con 100 punti', () => {
    const s = suggestRate({
      yearsExperience: 12,
      totalMinutes: 200 * 60,
      athletesCount: 30,
      ratingAverage: 5,
      ratingCount: 20,
      certificationsCount: 3,
      certificationsVerified: true,
      athleteLevels: ['pro'],
    });
    assert.equal(s.score, 100);
    assert.equal(s.level.key, 'senior');
    assert.equal(s.next, null);
  });
  it('la valutazione conta solo con abbastanza recensioni, e non pesa sul punteggio finché non conta', () => {
    const base = { ...empty, yearsExperience: 10, totalMinutes: 100 * 60, athletesCount: 15, certificationsVerified: true, certificationsCount: 1, athleteLevels: ['pro'] };
    const few = suggestRate({ ...base, ratingAverage: 5, ratingCount: 1 });
    assert.equal(few.factors.find((f) => f.key === 'rating')?.skipped, true);
    assert.equal(few.score, 100, 'senza la voce, il resto si riscala: chi ha tutto il resto è comunque al massimo');
    const many = suggestRate({ ...base, ratingAverage: 3, ratingCount: 10 });
    assert.ok(many.score < 100);
  });
  it('i titoli dichiarati valgono la metà dei verificati', () => {
    const t = (verified: boolean, n: number) =>
      suggestRate({ ...empty, certificationsCount: n, certificationsVerified: verified }).factors.find((f) => f.key === 'titles')!.earned;
    assert.equal(t(false, 0), 0);
    assert.equal(t(false, 2), 7.5);
    assert.equal(t(true, 2), 15);
  });
  it('non usa dati che non c’entrano: stessi fatti, stesso risultato', () => {
    const a = suggestRate({ ...empty, yearsExperience: 6, athletesCount: 5 });
    const b = suggestRate({ ...empty, yearsExperience: 6, athletesCount: 5 });
    assert.deepEqual(a, b);
  });
  it('indica cosa far salire per il livello successivo, al massimo tre cose', () => {
    const s = suggestRate({ ...empty, yearsExperience: 3 });
    assert.ok(s.next && s.next.actions.length > 0 && s.next.actions.length <= 3);
  });
});

// La taratura sui quattro coach veri di ottobre 2026 (dati letti dal database).
describe('taratura sui coach reali', () => {
  const francesco = suggestRate({
    yearsExperience: 11, totalMinutes: 44 * 60, athletesCount: 13, ratingAverage: 5, ratingCount: 5,
    certificationsCount: 1, certificationsVerified: false, athleteLevels: ['amateur', 'semi_pro', 'pro', 'youth'],
  });
  const monia = suggestRate({
    yearsExperience: 4, totalMinutes: 5 * 60, athletesCount: 6, ratingAverage: null, ratingCount: 0,
    certificationsCount: 3, certificationsVerified: true, athleteLevels: ['amateur'],
  });
  const emanuele = suggestRate({
    yearsExperience: 0, totalMinutes: 5 * 60, athletesCount: 1, ratingAverage: null, ratingCount: 0,
    certificationsCount: 2, certificationsVerified: false, athleteLevels: ['amateur', 'semi_pro', 'pro', 'youth'],
  });
  const daniela = suggestRate({
    yearsExperience: 0, totalMinutes: 0, athletesCount: 0, ratingAverage: null, ratingCount: 0,
    certificationsCount: 0, certificationsVerified: false, athleteLevels: ['amateur', 'semi_pro'],
  });
  it('con 11 anni, 13 atleti e valutazione 5 si è Senior; con 4 anni e titoli verificati, Consolidato; chi parte è Avvio', () => {
    assert.equal(francesco.level.key, 'senior');
    assert.equal(monia.level.key, 'consolidato');
    assert.equal(emanuele.level.key, 'avvio');
    assert.equal(daniela.level.key, 'avvio');
  });
  it('il prezzo attuale di Francesco (130 €) sta nella sua fascia, quello di Daniela (100 €) è sopra la sua', () => {
    assert.equal(positionInBand(130, 60, francesco.level), 'within');
    assert.equal(positionInBand(60, 60, emanuele.level), 'within');
    assert.equal(positionInBand(100, 60, daniela.level), 'above');
  });
});

describe('suggestedPriceForDuration e positionInBand', () => {
  it('proporzionale alla durata e arrotondato a 5 euro, mai sotto 5', () => {
    assert.equal(suggestedPriceForDuration(90, 60), 90);
    assert.equal(suggestedPriceForDuration(90, 45), 70); // 67,5 → 70
    assert.equal(suggestedPriceForDuration(90, 30), 45);
    assert.equal(suggestedPriceForDuration(1, 1), 5);
    assert.equal(suggestedPriceForDuration(NaN, 60), 0);
    assert.equal(suggestedPriceForDuration(90, 0), 0);
  });
  it('un prezzo per una durata diversa da 60 minuti si confronta in euro l’ora', () => {
    const l = RATE_LEVELS.find((x) => x.key === 'consolidato')!;
    assert.equal(positionInBand(40, 30, l), 'within'); // 80 €/h: il limite alto è incluso
    assert.equal(positionInBand(45, 30, l), 'above'); // 90 €/h
    assert.equal(positionInBand(25, 30, l), 'below'); // 50 €/h
  });
  it('senza prezzo o durata valida non dice niente', () => {
    const l = RATE_LEVELS[0];
    assert.equal(positionInBand(0, 60, l), null);
    assert.equal(positionInBand(50, 0, l), null);
  });
  it('levelForScore rispetta le soglie 0, 30, 55, 75', () => {
    assert.equal(levelForScore(29).key, 'avvio');
    assert.equal(levelForScore(30).key, 'consolidato');
    assert.equal(levelForScore(55).key, 'esperto');
    assert.equal(levelForScore(75).key, 'senior');
  });
});

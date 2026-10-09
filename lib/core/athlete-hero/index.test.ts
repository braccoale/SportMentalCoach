import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COACH_HERO_FEMALE,
  COACH_HERO_MALE,
  HERO_DEFAULT_NEUTRAL,
  coachHeroCandidates,
  heroImageCandidates,
} from './index';

const tennis = {
  heroImageMale: '/athlete-hero/tennis-uomo.webp',
  heroImageFemale: '/athlete-hero/tennis-donna.webp',
};

describe('heroImageCandidates', () => {
  it('una donna: prima l’immagine dello sport, poi la riserva', () => {
    assert.deepEqual(heroImageCandidates({ gender: 'female', sport: tennis }), [
      '/athlete-hero/tennis-donna.webp',
      HERO_DEFAULT_NEUTRAL,
    ]);
  });
  it('un uomo: l’immagine maschile dello sport, poi la riserva', () => {
    assert.deepEqual(heroImageCandidates({ gender: 'male', sport: tennis }), [
      '/athlete-hero/tennis-uomo.webp',
      HERO_DEFAULT_NEUTRAL,
    ]);
  });
  it('senza genere dichiarato ma con uno sport: sceglie a sorte fra uomo e donna', () => {
    const uomoPrima = ['/athlete-hero/tennis-uomo.webp', '/athlete-hero/tennis-donna.webp', HERO_DEFAULT_NEUTRAL];
    const donnaPrima = ['/athlete-hero/tennis-donna.webp', '/athlete-hero/tennis-uomo.webp', HERO_DEFAULT_NEUTRAL];
    assert.deepEqual(heroImageCandidates({ gender: null, sport: tennis, pick: 0.1 }), uomoPrima);
    assert.deepEqual(heroImageCandidates({ gender: null, sport: tennis, pick: 0.9 }), donnaPrima);
    assert.deepEqual(heroImageCandidates({ gender: 'undisclosed', sport: tennis, pick: 0.1 }), uomoPrima);
  });
  it('il sorteggio non cambia nulla per chi ha dichiarato il genere', () => {
    assert.deepEqual(heroImageCandidates({ gender: 'female', sport: tennis, pick: 0.1 }), [
      '/athlete-hero/tennis-donna.webp',
      HERO_DEFAULT_NEUTRAL,
    ]);
  });
  it('se dello sport esiste una sola immagine, quella (o la riserva)', () => {
    assert.deepEqual(
      heroImageCandidates({
        gender: null,
        sport: { heroImageMale: null, heroImageFemale: '/athlete-hero/calcio-donna.webp' },
        pick: 0.1,
      }),
      ['/athlete-hero/calcio-donna.webp', HERO_DEFAULT_NEUTRAL]
    );
  });
  it('senza genere e senza sport: solo la riserva', () => {
    assert.deepEqual(heroImageCandidates({ gender: null, sport: null, pick: 0.3 }), [HERO_DEFAULT_NEUTRAL]);
  });
  it('senza sport (o sport senza immagini) resta la riserva', () => {
    assert.deepEqual(heroImageCandidates({ gender: 'female', sport: null }), [HERO_DEFAULT_NEUTRAL]);
    assert.deepEqual(
      heroImageCandidates({ gender: 'male', sport: { heroImageMale: null, heroImageFemale: null } }),
      [HERO_DEFAULT_NEUTRAL]
    );
  });
  it('un percorso fuori dalla cartella delle immagini o con «..» si scarta', () => {
    assert.deepEqual(
      heroImageCandidates({
        gender: 'male',
        sport: { heroImageMale: 'https://esempio.it/x.webp', heroImageFemale: '/athlete-hero/../segreto.webp' },
      }),
      [HERO_DEFAULT_NEUTRAL]
    );
  });
});

describe('coachHeroCandidates', () => {
  it('senza genere: uomo o donna a sorte, entrambi per il ripiego', () => {
    assert.deepEqual(coachHeroCandidates({ pick: 0.1 }), [COACH_HERO_MALE, COACH_HERO_FEMALE]);
    assert.deepEqual(coachHeroCandidates({ pick: 0.9 }), [COACH_HERO_FEMALE, COACH_HERO_MALE]);
    assert.deepEqual(coachHeroCandidates({ gender: 'undisclosed', pick: 0.1 }), [COACH_HERO_MALE, COACH_HERO_FEMALE]);
    assert.deepEqual(coachHeroCandidates(), [COACH_HERO_FEMALE, COACH_HERO_MALE]);
  });
  it("con il genere dichiarato non si mostra mai l'immagine dell'altro", () => {
    assert.deepEqual(coachHeroCandidates({ gender: 'female', pick: 0.1 }), [COACH_HERO_FEMALE, HERO_DEFAULT_NEUTRAL]);
    assert.deepEqual(coachHeroCandidates({ gender: 'male', pick: 0.9 }), [COACH_HERO_MALE, HERO_DEFAULT_NEUTRAL]);
  });
});

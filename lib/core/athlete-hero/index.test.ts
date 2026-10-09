import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HERO_DEFAULT_NEUTRAL, heroImageCandidates } from './index';

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
  it('senza genere dichiarato: solo la riserva, mai una foto indovinata', () => {
    assert.deepEqual(heroImageCandidates({ gender: null, sport: tennis }), [HERO_DEFAULT_NEUTRAL]);
    assert.deepEqual(heroImageCandidates({ gender: 'undisclosed', sport: tennis }), [
      HERO_DEFAULT_NEUTRAL,
    ]);
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

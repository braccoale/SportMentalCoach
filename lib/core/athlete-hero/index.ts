/**
 * L'immagine in alto a destra nella dashboard dell'atleta, scelta in base al
 * suo sport e al suo genere.
 *
 * Le immagini sono file in `public/athlete-hero/` e il collegamento sta nella
 * tabella `sports` (due colonne: `hero_image_male` e `hero_image_female`). La
 * scelta è una **lista ordinata di candidati**, dal più specifico al più
 * generico; chi la mostra prova il primo e, se il file non c'è, passa al
 * successivo (un'immagine mancante non deve mai lasciare un riquadro rotto):
 *
 *   1. sport + genere dell'atleta;
 *   2. l'immagine di riserva per il genere;
 *   3. l'immagine neutra.
 *
 * Chi non ha dichiarato il genere (o ha scelto «preferisco non specificare»)
 * vede **solo l'immagine neutra**: indovinare e mostrare a un uomo la foto di
 * una donna, o il contrario, è peggio di un'immagine generica.
 *
 * Modulo puro.
 */
import type { AthleteGender } from '@/lib/core/profiles/gender';

export const HERO_IMAGE_DIR = '/athlete-hero';
export const HERO_DEFAULT_MALE = `${HERO_IMAGE_DIR}/default-uomo.webp`;
export const HERO_DEFAULT_FEMALE = `${HERO_IMAGE_DIR}/default-donna.webp`;
export const HERO_DEFAULT_NEUTRAL = `${HERO_IMAGE_DIR}/default.webp`;

export type SportHeroImages = {
  heroImageMale: string | null;
  heroImageFemale: string | null;
};

/** Solo percorsi interni sotto la cartella delle immagini: un valore sporco nel database non esce dal sito. */
function safeImagePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return v.startsWith(`${HERO_IMAGE_DIR}/`) && !v.includes('..') ? v : null;
}

export function heroImageCandidates(params: {
  gender: AthleteGender | null;
  sport: SportHeroImages | null;
}): string[] {
  const male = safeImagePath(params.sport?.heroImageMale);
  const female = safeImagePath(params.sport?.heroImageFemale);
  const gender = params.gender;

  const ordered: (string | null)[] = [];
  if (gender === 'male') {
    ordered.push(male, HERO_DEFAULT_MALE);
  } else if (gender === 'female') {
    ordered.push(female, HERO_DEFAULT_FEMALE);
  }
  ordered.push(HERO_DEFAULT_NEUTRAL);

  return [...new Set(ordered.filter((p): p is string => Boolean(p)))];
}

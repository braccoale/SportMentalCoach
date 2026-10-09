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
 *   2. l'immagine di riserva (`default.webp`), la stessa per tutti.
 *
 * Chi non ha dichiarato il genere (o ha scelto «preferisco non specificare»)
 * ma ha uno sport vede l'immagine di quello sport **scelta a caso** fra la
 * versione con l'uomo e quella con la donna (se una sola esiste, quella): il
 * sito non deduce niente dal nome né dalla foto, tira a sorte. Il sorteggio lo
 * decide chi chiama (`pick`, un numero fra 0 e 1), così la funzione resta
 * pura e si prova con un valore fisso.
 *
 * Modulo puro.
 */
import type { AthleteGender } from '@/lib/core/profiles/gender';

export const HERO_IMAGE_DIR = '/athlete-hero';
/** La riserva, uguale per uomo, donna e chi non ha dichiarato il genere. */
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
  /** Sorteggio fra 0 (incluso) e 1 (escluso), usato solo se il genere non è dichiarato. */
  pick?: number;
}): string[] {
  const male = safeImagePath(params.sport?.heroImageMale);
  const female = safeImagePath(params.sport?.heroImageFemale);
  const gender = params.gender;

  const ordered: (string | null)[] = [];
  if (gender === 'male') ordered.push(male);
  else if (gender === 'female') ordered.push(female);
  else if ((params.pick ?? 0.5) < 0.5) ordered.push(male, female);
  else ordered.push(female, male);
  ordered.push(HERO_DEFAULT_NEUTRAL);

  return [...new Set(ordered.filter((p): p is string => Boolean(p)))];
}

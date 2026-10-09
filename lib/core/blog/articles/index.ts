import type { BlogArticle } from '../index';
import { ANSIA_DA_PRESTAZIONE } from './ansia-da-prestazione';
import { MENTAL_COACH_RAGAZZI } from './mental-coach-ragazzi';
import { MENTAL_COACH_O_PSICOLOGO } from './mental-coach-o-psicologo-dello-sport';
import { SEDUTA_ONLINE } from './seduta-mental-coaching-online';
import { COME_SCEGLIERE } from './come-scegliere-mental-coach';
import { MINORI_CONSENSO } from './mental-coaching-minori-consenso';
import { SELEZIONE_COACH } from './come-selezioniamo-i-coach';

/** Tutti gli articoli del blog. Un articolo nuovo si aggiunge qui. */
export const BLOG_ARTICLES: readonly BlogArticle[] = [
  ANSIA_DA_PRESTAZIONE,
  MENTAL_COACH_RAGAZZI,
  MENTAL_COACH_O_PSICOLOGO,
  SEDUTA_ONLINE,
  COME_SCEGLIERE,
  MINORI_CONSENSO,
  SELEZIONE_COACH,
];

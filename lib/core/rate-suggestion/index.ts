/**
 * La tariffa oraria che la piattaforma *suggerisce* a un coach.
 *
 * È un aiuto, non una regola: il coach vede in che livello cade, in quale
 * fascia, perché e cosa lo farebbe salire, e il prezzo lo decide sempre lui.
 * Il calcolo è trasparente (punti per voce, nessun modello opaco) e usa solo
 * fatti sul lavoro del coach: esperienza, ore erogate, titoli, valutazioni,
 * atleti seguiti e livello degli atleti. Non usa genere, età, foto, città né
 * i prezzi degli altri coach: non c'entrano con il valore del servizio, e un
 * suggerimento basato sui prezzi altrui fra concorrenti non è una buona idea.
 *
 * Le fasce partono da riferimenti pubblici (coaching sportivo in Italia
 * 30–100 €/ora, media 50–80 €; terapia online circa 49 €) e vanno tarate con
 * i dati della piattaforma (richieste ricevute e accettate per prezzo).
 * Vanno presentate come «riferimento KaiPai», non come prezzo di mercato.
 *
 * Modulo puro, senza `server-only`: lo legge la pagina dei servizi e si prova
 * con numeri fissi.
 */

export type RateInput = {
  /** Anni di attività da «Coach dal» (o da `yearsExperience`); null se non dichiarati. */
  yearsExperience: number | null;
  /** Minuti di coaching erogati sulla piattaforma. */
  totalMinutes: number;
  athletesCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  /** Titoli e formazione elencati dal coach. */
  certificationsCount: number;
  /** Titoli verificati dal team KaiPai. */
  certificationsVerified: boolean;
  /** Chiavi dei livelli degli atleti con cui lavora (`pro`, `semi_pro`, `youth`, `amateur`). */
  athleteLevels: string[];
};

export type RateLevelKey = 'avvio' | 'consolidato' | 'esperto' | 'senior';

export type RateLevel = {
  key: RateLevelKey;
  label: string;
  /** Punteggio minimo (0–100) per entrare nel livello. */
  minScore: number;
  /** Fascia oraria in euro, per 60 minuti. */
  min: number;
  max: number;
  suggested: number;
};

export const RATE_LEVELS: RateLevel[] = [
  { key: 'avvio', label: 'Avvio', minScore: 0, min: 40, max: 60, suggested: 50 },
  { key: 'consolidato', label: 'Consolidato', minScore: 30, min: 55, max: 80, suggested: 65 },
  { key: 'esperto', label: 'Esperto', minScore: 55, min: 75, max: 110, suggested: 90 },
  { key: 'senior', label: 'Senior', minScore: 75, min: 100, max: 150, suggested: 120 },
];

/** Recensioni minime perché la valutazione conti: una sola da cinque stelle non basta. */
export const MIN_REVIEWS_FOR_RATING = 5;

export type RateFactor = {
  key: 'experience' | 'hours' | 'titles' | 'rating' | 'athletes' | 'athleteLevel';
  label: string;
  max: number;
  earned: number;
  /** La voce non conta (dati insufficienti): non entra nel punteggio. */
  skipped: boolean;
  /** Cosa fare per guadagnare di più, in una frase. */
  hint: string;
  /** La stessa cosa in poche parole, per l'elenco «Come migliorare il tuo profilo». */
  action: string;
};

export type RateSuggestion = {
  /** 0–100, riscalato sulle voci che contano. */
  score: number;
  level: RateLevel;
  factors: RateFactor[];
  /** Il livello successivo e quanto manca, se esiste. */
  next: { level: RateLevel; pointsMissing: number; actions: string[] } | null;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function athleteLevelFraction(levels: string[]): number {
  if (levels.includes('pro')) return 1;
  if (levels.includes('semi_pro')) return 0.7;
  if (levels.includes('youth') || levels.includes('amateur')) return 0.3;
  return 0;
}

export function levelForScore(score: number, levels: RateLevel[] = RATE_LEVELS): RateLevel {
  let current = levels[0];
  for (const level of levels) if (score >= level.minScore) current = level;
  return current;
}

/**
 * `levels` sono le fasce in vigore (dalla configurazione di sistema, vedi
 * `resolveRateLevels`); senza, valgono i predefiniti `RATE_LEVELS`.
 */
export function suggestRate(input: RateInput, levels: RateLevel[] = RATE_LEVELS): RateSuggestion {
  const hours = Math.max(0, input.totalMinutes) / 60;
  const ratingCounts = input.ratingAverage != null && input.ratingCount >= MIN_REVIEWS_FOR_RATING;

  const factors: RateFactor[] = [
    {
      key: 'experience',
      label: 'Anni di esperienza',
      max: 20,
      earned: clamp01((input.yearsExperience ?? 0) / 10) * 20,
      skipped: false,
      hint: 'Indica da quando fai il coach nel tuo profilo: il massimo si raggiunge a 10 anni.',
      action: (input.yearsExperience ?? 0) > 0 ? 'Completa gli anni di esperienza' : 'Indica da quando fai il coach',
    },
    {
      key: 'hours',
      label: 'Ore di coaching sulla piattaforma',
      max: 20,
      earned: clamp01(hours / 100) * 20,
      skipped: false,
      hint: 'Le ore erogate crescono con le sedute: il massimo a 100 ore.',
      action: 'Aumenta le ore di coaching con nuove sessioni',
    },
    {
      key: 'titles',
      label: 'Titoli e formazione',
      max: 15,
      earned: input.certificationsVerified
        ? 15
        : input.certificationsCount > 0
          ? 7.5
          : 0,
      skipped: false,
      hint: input.certificationsCount > 0
        ? 'I tuoi titoli contano per metà finché il team KaiPai non li verifica.'
        : 'Elenca i titoli e la formazione che hai: contano per metà, per intero se verificati.',
      action: input.certificationsCount > 0 ? 'Fai verificare i tuoi titoli' : 'Aggiungi i tuoi titoli e la formazione',
    },
    {
      key: 'rating',
      label: 'Valutazione degli atleti',
      max: 15,
      earned: ratingCounts ? clamp01(((input.ratingAverage ?? 0) - 3) / 2) * 15 : 0,
      skipped: !ratingCounts,
      hint: `Conta dopo ${MIN_REVIEWS_FOR_RATING} recensioni: una sola, anche da cinque stelle, non basta.`,
      action: 'Ottieni valutazioni dagli atleti',
    },
    {
      key: 'athletes',
      label: 'Atleti seguiti',
      max: 10,
      earned: clamp01(input.athletesCount / 15) * 10,
      skipped: false,
      hint: 'Il massimo si raggiunge con 15 atleti seguiti.',
      action: 'Segui più atleti',
    },
    {
      key: 'athleteLevel',
      label: 'Livello degli atleti',
      max: 10,
      earned: athleteLevelFraction(input.athleteLevels) * 10,
      skipped: false,
      hint: 'Lavorare con atleti professionisti o semi-professionisti vale di più: indica i livelli nel profilo.',
      action: 'Indica i livelli degli atleti nel profilo',
    },
  ];

  const counted = factors.filter((f) => !f.skipped);
  const max = counted.reduce((s, f) => s + f.max, 0);
  const earned = counted.reduce((s, f) => s + f.earned, 0);
  const score = max > 0 ? Math.round((earned / max) * 100) : 0;
  const level = levelForScore(score, levels);

  const idx = levels.findIndex((l) => l.key === level.key);
  const nextLevel = levels[idx + 1];
  const next = nextLevel
    ? {
        level: nextLevel,
        pointsMissing: Math.max(0, nextLevel.minScore - score),
        actions: factors
          .filter((f) => f.earned < f.max)
          .sort((a, b) => b.max - b.earned - (a.max - a.earned))
          .slice(0, 3)
          .map((f) => f.action),
      }
    : null;

  return { score, level, factors, next };
}

/** Il prezzo suggerito per una seduta di `durationMin` minuti, in euro, arrotondato a 5 (minimo 5). */
export function suggestedPriceForDuration(hourlyEuro: number, durationMin: number): number {
  if (!Number.isFinite(hourlyEuro) || !Number.isFinite(durationMin) || durationMin <= 0) return 0;
  const raw = (hourlyEuro * durationMin) / 60;
  return Math.max(5, Math.round(raw / 5) * 5);
}

export type RatePosition = 'below' | 'within' | 'above';

/** Dove cade un prezzo (per una seduta di `durationMin` minuti) rispetto alla fascia oraria del livello. */
export function positionInBand(
  priceEuro: number,
  durationMin: number,
  level: RateLevel
): RatePosition | null {
  if (!Number.isFinite(priceEuro) || priceEuro <= 0 || !Number.isFinite(durationMin) || durationMin <= 0) {
    return null;
  }
  const hourly = (priceEuro * 60) / durationMin;
  if (hourly < level.min) return 'below';
  if (hourly > level.max) return 'above';
  return 'within';
}

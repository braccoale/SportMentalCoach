/**
 * L'abbinamento fra le risposte del wizard e i profili dei coach.
 *
 * Tre passi, tutti puri:
 *  1. **filtri rigidi** — un coach che non può servire l'atleta (livello che
 *     non segue, prezzo oltre il budget) non si propone, per quanto il suo
 *     testo sia affine. Lo sport è rigido finché c'è almeno un coach che lo
 *     segue; se nessuno lo segue si rilassa, e il risultato lo dichiara;
 *  2. **punteggio** — temi scelti contro le specialità (45), sport (15),
 *     livello (5), affinità fra il testo/lo stile dell'atleta e la
 *     presentazione del coach (35). Se l'atleta non ha scritto né scelto uno
 *     stile, la parte di affinità non conta e il punteggio si riscala;
 *  3. **selezione** — al massimo quattro, e solo quelli che non sono molto
 *     lontani dal migliore: meglio due coach adatti che quattro per riempire.
 *
 * L'affinità dal testo la calcola un provider (OpenAI) oppure, se non
 * risponde, un confronto lessicale (`lexicalAffinity`): il wizard non si
 * rompe se il provider non c'è.
 */
import { MATCH_THEMES, type MatchAnswers } from './answers';

export const MAX_RESULTS = 4;
/** Sotto questa frazione del punteggio del migliore, un coach non si propone. */
export const MIN_RELATIVE_SCORE = 0.55;
/** Sotto questo punteggio assoluto (0–100) non è un abbinamento, è un riempitivo. */
export const MIN_ABSOLUTE_SCORE = 20;

export const WEIGHTS = { themes: 45, sport: 15, level: 5, affinity: 35 } as const;

export type MatchCandidate = {
  providerId: number;
  slug: string;
  displayName: string | null;
  headline: string | null;
  description: string | null;
  avatarUrl: string | null;
  categories: string[];
  specialties: string[];
  athleteLevels: string[];
  /** Prezzo più basso fra i servizi attivi, in centesimi; null se nessun servizio ha prezzo. */
  minPriceCents: number | null;
  currency: string;
  yearsExperience: number | null;
};

export type AffinityResult = {
  providerId: number;
  /** 0–1. */
  affinity: number;
  /** Una frase sul perché è adatto, solo dal provider. */
  reason: string | null;
};

export type ScoredCoach = {
  candidate: MatchCandidate;
  /** 0–100. */
  score: number;
  /** Specialità (chiavi) che coprono i temi scelti. */
  matchedSpecialties: string[];
  sportMatch: boolean;
  reason: string | null;
};

export type FilterOutcome = {
  candidates: MatchCandidate[];
  /** Nessun coach segue lo sport indicato: il filtro è stato rilassato. */
  sportRelaxed: boolean;
};

/** Filtri rigidi su livello e budget, poi sport (rilassato se lascerebbe vuoto). */
export function applyHardFilters(all: MatchCandidate[], answers: MatchAnswers): FilterOutcome {
  const byLevelAndBudget = all.filter((c) => {
    if (answers.level && c.athleteLevels.length > 0 && !c.athleteLevels.includes(answers.level)) {
      return false;
    }
    if (
      answers.budgetMaxCents != null &&
      c.minPriceCents != null &&
      c.minPriceCents > answers.budgetMaxCents
    ) {
      return false;
    }
    return true;
  });
  if (!answers.sport) return { candidates: byLevelAndBudget, sportRelaxed: false };
  const sport = answers.sport;
  const withSport = byLevelAndBudget.filter((c) => c.categories.includes(sport));
  if (withSport.length > 0) return { candidates: withSport, sportRelaxed: false };
  return { candidates: byLevelAndBudget, sportRelaxed: byLevelAndBudget.length > 0 };
}

/** Le specialità del coach che coprono almeno un tema scelto, e la frazione di temi coperti. */
export function themeCoverage(
  themes: MatchAnswers['themes'],
  specialties: string[]
): { fraction: number; matched: string[] } {
  if (themes.length === 0) return { fraction: 0, matched: [] };
  const have = new Set(specialties);
  const matched = new Set<string>();
  let covered = 0;
  for (const key of themes) {
    const theme = MATCH_THEMES.find((t) => t.key === key);
    if (!theme) continue;
    const hit = theme.specialtyKeys.filter((s) => have.has(s));
    if (hit.length > 0) covered += 1;
    hit.forEach((s) => matched.add(s));
  }
  return { fraction: covered / themes.length, matched: [...matched] };
}

const STOPWORDS = new Set(
  (
    'il lo la i gli le un uno una di a da in con su per tra fra e ed o ma che non mi ti si ci vi ' +
    'sono sei è e essere ho hai ha abbiamo hanno mio mia miei mie tuo tua suo sua del dello della dei degli delle ' +
    'al allo alla ai agli alle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle ' +
    'come più piu molto anche quando quanto questo questa questi queste quello quella cosa cose ' +
    'poi se già gia sempre ogni solo tutto tutti vorrei voglio riesco fare farlo faccio prima dopo durante'
  ).split(' ')
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t))
    // radice grossolana: «ansia/ansioso», «gara/gare» si incontrano.
    .map((t) => t.slice(0, 5));
}

/**
 * Affinità lessicale 0–1: quante radici del testo dell'atleta compaiono nel
 * titolo e nella presentazione del coach. È il ripiego quando il provider non
 * risponde; non capisce i sinonimi, e va bene così.
 */
export function lexicalAffinity(athleteText: string, coachText: string): number {
  const wanted = new Set(tokens(athleteText));
  if (wanted.size === 0) return 0;
  const have = new Set(tokens(coachText));
  let hits = 0;
  for (const t of wanted) if (have.has(t)) hits += 1;
  // Poche parole in comune bastano: la presentazione di un coach è lunga.
  return Math.min(1, hits / Math.min(wanted.size, 6));
}

export function coachText(c: MatchCandidate): string {
  return [c.headline, c.description].filter(Boolean).join(' ');
}

export function scoreCoaches(
  candidates: MatchCandidate[],
  answers: MatchAnswers,
  affinities: Map<number, AffinityResult>,
  useAffinity: boolean
): ScoredCoach[] {
  const maxPoints =
    WEIGHTS.themes +
    (answers.sport ? WEIGHTS.sport : 0) +
    (answers.level ? WEIGHTS.level : 0) +
    (useAffinity ? WEIGHTS.affinity : 0);
  return candidates.map((candidate) => {
    const { fraction, matched } = themeCoverage(answers.themes, candidate.specialties);
    const sportMatch = !!answers.sport && candidate.categories.includes(answers.sport);
    const levelMatch = !!answers.level && candidate.athleteLevels.includes(answers.level);
    const aff = affinities.get(candidate.providerId);
    let points = fraction * WEIGHTS.themes;
    if (sportMatch) points += WEIGHTS.sport;
    if (levelMatch) points += WEIGHTS.level;
    if (useAffinity) points += Math.max(0, Math.min(1, aff?.affinity ?? 0)) * WEIGHTS.affinity;
    const score = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0;
    return { candidate, score, matchedSpecialties: matched, sportMatch, reason: aff?.reason ?? null };
  });
}

/** I migliori, ordinati; spareggio per anni di esperienza e poi per id (stabile). */
export function selectTop(scored: ScoredCoach[]): ScoredCoach[] {
  const sorted = [...scored].sort(
    (a, b) =>
      b.score - a.score ||
      (b.candidate.yearsExperience ?? 0) - (a.candidate.yearsExperience ?? 0) ||
      a.candidate.providerId - b.candidate.providerId
  );
  if (sorted.length === 0) return [];
  const best = sorted[0].score;
  return sorted
    .filter((s, i) => i === 0 || (s.score >= MIN_ABSOLUTE_SCORE && s.score >= best * MIN_RELATIVE_SCORE))
    .slice(0, MAX_RESULTS);
}

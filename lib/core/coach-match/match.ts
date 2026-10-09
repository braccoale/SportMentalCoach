/**
 * L'orchestrazione dell'abbinamento, senza accesso al database: riceve i
 * coach candidati e (se c'è) il provider dell'affinità, e restituisce cosa
 * mostrare. Si prova con candidati finti e un provider finto.
 */
import {
  MATCH_MOMENTS,
  MATCH_STYLES,
  MATCH_THEMES,
  hasEnoughToMatch,
  mentionsDistress,
  type MatchAnswers,
} from './answers';
import type { CoachAffinityProvider } from './provider';
import {
  applyHardFilters,
  coachText,
  lexicalAffinity,
  scoreCoaches,
  selectTop,
  type AffinityResult,
  type MatchCandidate,
} from './scoring';

export type MatchedCoach = {
  providerId: number;
  slug: string;
  displayName: string | null;
  headline: string | null;
  avatarUrl: string | null;
  minPriceCents: number | null;
  currency: string;
  /** Perché è adatto: prima la frase del provider (se c'è), poi le specialità che combaciano. */
  reasons: string[];
};

export type MatchResult = {
  status: 'ok' | 'not_enough';
  coaches: MatchedCoach[];
  /** Nessun coach segue lo sport indicato: i risultati sono per gli altri criteri. */
  sportRelaxed: boolean;
  /** Il testo parla di un disagio: mostrare sopra i risultati dove chiedere aiuto. */
  distress: boolean;
  /** L'affinità del testo è stata valutata dal provider (non solo dal confronto lessicale). */
  usedAi: boolean;
};

export type MatchDeps = {
  provider: CoachAffinityProvider | null;
  specialtyLabel: (key: string) => string;
  sportLabel: (key: string) => string;
  /** Per registrare un ripiego del provider, senza testo né dati dell'atleta. */
  onProviderFailure?: (error: unknown) => void;
};

const styleHint = (key: string) => MATCH_STYLES.find((m) => m.key === key)?.hint ?? key;

export async function runCoachMatch(
  all: MatchCandidate[],
  answers: MatchAnswers,
  deps: MatchDeps
): Promise<MatchResult> {
  const distress = mentionsDistress(answers.freeText);
  if (!hasEnoughToMatch(answers)) {
    return { status: 'not_enough', coaches: [], sportRelaxed: false, distress, usedAi: false };
  }

  const { candidates, sportRelaxed } = applyHardFilters(all, answers);
  if (candidates.length === 0) {
    return { status: 'ok', coaches: [], sportRelaxed: false, distress, usedAi: false };
  }

  // L'affinità conta solo se l'atleta ha scritto o scelto uno stile.
  const useAffinity = answers.freeText.length >= 10 || answers.styles.length > 0;
  const affinities = new Map<number, AffinityResult>();
  let usedAi = false;
  if (useAffinity) {
    const queryText = [answers.freeText, ...answers.styles.map(styleHint)].join(' ');
    for (const c of candidates) {
      affinities.set(c.providerId, {
        providerId: c.providerId,
        affinity: lexicalAffinity(queryText, coachText(c)),
        reason: null,
      });
    }
    if (deps.provider) {
      try {
        const results = await deps.provider.evaluate({
          answers,
          themeLabels: answers.themes.map((t) => MATCH_THEMES.find((m) => m.key === t)?.label ?? t),
          momentLabels: answers.moments.map((m) => MATCH_MOMENTS.find((x) => x.key === m)?.label ?? m),
          styleHints: answers.styles.map(styleHint),
          coaches: candidates.map((c) => ({
            providerId: c.providerId,
            headline: c.headline,
            description: c.description,
            specialties: c.specialties.map(deps.specialtyLabel),
            sports: c.categories.map(deps.sportLabel),
            yearsExperience: c.yearsExperience,
          })),
        });
        for (const r of results) affinities.set(r.providerId, r);
        usedAi = results.length > 0;
      } catch (error) {
        // Il ripiego lessicale c'è già: il wizard non si rompe.
        deps.onProviderFailure?.(error);
      }
    }
  }

  const top = selectTop(scoreCoaches(candidates, answers, affinities, useAffinity));
  const coaches: MatchedCoach[] = top.map((s) => {
    const reasons: string[] = [];
    if (s.reason) reasons.push(s.reason);
    if (s.matchedSpecialties.length > 0) {
      reasons.push(`Lavora su: ${s.matchedSpecialties.map(deps.specialtyLabel).join(', ')}`);
    }
    if (s.sportMatch && answers.sport) reasons.push(`Segue atleti di ${deps.sportLabel(answers.sport)}`);
    return {
      providerId: s.candidate.providerId,
      slug: s.candidate.slug,
      displayName: s.candidate.displayName,
      headline: s.candidate.headline,
      avatarUrl: s.candidate.avatarUrl,
      minPriceCents: s.candidate.minPriceCents,
      currency: s.candidate.currency,
      reasons,
    };
  });
  return { status: 'ok', coaches, sportRelaxed, distress, usedAi };
}

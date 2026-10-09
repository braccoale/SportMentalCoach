/**
 * Il confine verso chi valuta l'affinità fra il testo dell'atleta e i profili
 * dei coach. Dietro un'interfaccia perché l'abbinamento deve poter girare (e
 * provarsi) senza chiamare OpenAI.
 */
import type { MatchAnswers } from './answers';
import type { AffinityResult } from './scoring';

export type AffinityCoachInput = {
  providerId: number;
  headline: string | null;
  description: string | null;
  /** Etichette leggibili delle specialità. */
  specialties: string[];
  sports: string[];
  yearsExperience: number | null;
};

export interface CoachAffinityProvider {
  /** Un risultato per coach; i coach mancanti nella risposta valgono 0. */
  evaluate(input: {
    answers: MatchAnswers;
    themeLabels: string[];
    momentLabels: string[];
    styleHints: string[];
    coaches: AffinityCoachInput[];
  }): Promise<AffinityResult[]>;
}

/**
 * I due riquadri accanto al percorso: gli impegni e i temi.
 *
 * Non calcolano niente che il dominio sappia già — la quota di completamento
 * la decide `mental-journey.ts`, e va letta, non rifatta. Qui vivono soltanto
 * le due regole di presentazione che è facile sbagliare in silenzio: come si
 * raggruppano gli stati degli impegni, e che cosa misura davvero la lunghezza
 * di una barra.
 */

import type { JourneySummary, RecurringTheme } from './mental-journey';

export const COMMITMENT_ROW_KEYS = [
  'completed',
  'inProgress',
  'skipped',
] as const;
export type CommitmentRowKey = (typeof COMMITMENT_ROW_KEYS)[number];

/**
 * Tre righe più il totale, come nel disegno.
 *
 * Il dominio distingue quattro stati, non tre: `pending` è un impegno che non è
 * ancora iniziato, `in_progress` uno già avviato. Qui vanno insieme sotto «In
 * corso», e la scelta è deliberata: il coach guarda questo riquadro per sapere
 * quanto lavoro è ancora aperto, e sia l'uno sia l'altro lo sono.
 *
 * Quello che invece non si accorpa mai è `skipped`: un impegno lasciato cadere
 * non è lavoro aperto, e metterlo con gli altri due racconterebbe come ancora
 * vivo qualcosa che è finito. È la riga che deve restare da sola.
 */
export const COMMITMENT_ROW_LABELS: Record<CommitmentRowKey, string> = {
  completed: 'Completate',
  inProgress: 'In corso',
  skipped: 'Non completate',
};

export type CommitmentRow = {
  key: CommitmentRowKey;
  label: string;
  count: number;
};

export type CommitmentBreakdown = {
  total: number;
  rows: CommitmentRow[];
  /**
   * La quota decisa dal dominio, **in centesimi**: 73 significa 73%, non 73
   * volte. Il tipo non lo dice e il nome nemmeno, e l'anello l'ha letta una
   * volta come frazione disegnando un cerchio pieno con «100%» al centro su
   * un percorso completato al 73.
   *
   * `null` quando gli impegni sono troppo pochi perché una percentuale
   * significhi qualcosa. Si legge, non si ricalcola: un secondo calcolo qui
   * sarebbe una seconda regola, e prima o poi le due direbbero numeri diversi
   * sullo stesso schermo.
   */
  completionRate: number | null;
};

export function buildCommitmentBreakdown(
  summary: JourneySummary
): CommitmentBreakdown {
  const counts = summary.commitments;
  return {
    total: counts.total,
    rows: COMMITMENT_ROW_KEYS.map((key) => ({
      key,
      label: COMMITMENT_ROW_LABELS[key],
      // «In corso» tiene dentro anche ciò che deve ancora cominciare: è
      // lavoro aperto allo stesso modo.
      count: key === 'inProgress' ? counts.inProgress + counts.pending : counts[key],
    })),
    completionRate: summary.completionRate,
  };
}

/** Oltre cinque, un elenco di temi smette di essere una gerarchia. */
export const MAX_THEME_BARS = 5;

export type ThemeBar = {
  key: string;
  label: string;
  occurrences: number;
  /** Lunghezza della barra, da 0 a 1. */
  fill: number;
  /** La quota di sedute in cui il tema è emerso, arrotondata. */
  percent: number;
  /** «In 6 sedute su 29»: il fatto verificabile dietro la percentuale. */
  countLabel: string;
};

/**
 * Le barre dei temi ricorrenti.
 *
 * Barra e percentuale dicono la stessa cosa: in quante sedute, sul totale di
 * quelle approvate, quel tema è emerso. Non è una misura dell'intensità del
 * tema né della sua importanza — è un conteggio espresso in percentuale, e il
 * conteggio vero resta disponibile in `countLabel` per il fumetto.
 */
export function buildThemeBars(
  themes: readonly RecurringTheme[],
  approvedSessionCount: number,
  max: number = MAX_THEME_BARS
): ThemeBar[] {
  if (themes.length === 0) return [];

  const top = [...themes]
    .sort((left, right) => right.occurrences - left.occurrences)
    .slice(0, max);
  const share = (theme: RecurringTheme) =>
    approvedSessionCount > 0
      ? Math.min(1, theme.occurrences / approvedSessionCount)
      : 0;

  return top.map((theme) => ({
    key: theme.key,
    label: theme.label,
    occurrences: theme.occurrences,
    fill: share(theme),
    percent: Math.round(share(theme) * 100),
    countLabel: `In ${theme.occurrences} ${
      theme.occurrences === 1 ? 'seduta' : 'sedute'
    } su ${approvedSessionCount}`,
  }));
}

/**
 * Gli obiettivi del percorso: su che cosa il coach sta lavorando con questa
 * persona, e in quali sedute quel filone è stato davvero toccato.
 *
 * Due autori diversi, e la distinzione è il punto:
 *
 * - **l'obiettivo e il suo stato li scrive il coach.** «In miglioramento» è un
 *   giudizio, e la Mental Journey dichiara di non attribuire miglioramenti né
 *   cause. Farlo decidere a un modello sarebbe esattamente ciò che quel
 *   modulo si vieta; qui il giudizio ha un autore, ed è una persona.
 * - **in quali sedute l'obiettivo è comparso è un fatto scritto**, non una
 *   somiglianza calcolata a ogni lettura.
 *
 * Il secondo punto è cambiato dopo averlo visto rompersi in produzione. Prima
 * l'aggancio era la chiave di un tema, che il dominio ricava normalizzando la
 * frase intera del riepilogo — una frase scritta da un modello, che cambia
 * formulazione di seduta in seduta. Quando le due frasi smettevano di
 * coincidere la traccia diventava una fila di pallini vuoti, che si legge
 * «non ci abbiamo più lavorato» invece che «il collegamento si è rotto».
 * Ora il legame si scrive una volta e resta.
 */

import type { MentalJourneyEntry, RecurringTheme } from './mental-journey';

export const JOURNEY_GOAL_STATUSES = [
  'in_corso',
  'in_miglioramento',
  'da_riprendere',
  'raggiunto',
] as const;
export type JourneyGoalStatus = (typeof JOURNEY_GOAL_STATUSES)[number];

export const JOURNEY_GOAL_STATUS_LABELS: Record<JourneyGoalStatus, string> = {
  in_corso: 'In corso',
  in_miglioramento: 'In miglioramento',
  da_riprendere: 'Da riprendere',
  raggiunto: 'Raggiunto',
};

/** Oltre, la riga diventa una fila di puntini che nessuno conta. */
export const MAX_GOAL_TRACK_DOTS = 9;

export type StoredJourneyGoal = {
  id: number;
  title: string;
  isPrimary: boolean;
  status: JourneyGoalStatus;
  themeKey: string | null;
  position: number;
  updatedAt: Date;
};

export type JourneyGoalDot = {
  sessionId: number;
  sessionDate: string | null;
  /** Il tema dell'obiettivo è emerso in questa seduta. */
  touched: boolean;
  href: string;
};

/** Le sedute agganciate a ciascun obiettivo, per id di obiettivo. */
export type GoalSessionLinks = ReadonlyMap<number, ReadonlySet<number>>;

export type JourneyGoalRow = {
  id: number;
  title: string;
  isPrimary: boolean;
  status: JourneyGoalStatus;
  track: JourneyGoalDot[];
  /** L'ultima seduta in cui il filone è emerso; `null` se non è mai emerso. */
  lastTouchedAt: string | null;
  updatedAt: string;
  /**
   * Almeno un pallino **visibile** è pieno.
   *
   * Si ricava dalla traccia e non dagli agganci: un obiettivo legato solo a
   * sedute più vecchie della finestra mostrata sarebbe «agganciato» ma con la
   * riga tutta vuota, e l'etichetta direbbe il contrario di quello che si
   * vede.
   */
  isTracked: boolean;
};

export function parseJourneyGoalStatus(raw: string): JourneyGoalStatus {
  return JOURNEY_GOAL_STATUSES.includes(raw as JourneyGoalStatus)
    ? (raw as JourneyGoalStatus)
    : 'in_corso';
}

/**
 * Le righe da disegnare.
 *
 * I pallini sono le sedute del percorso in ordine cronologico, le ultime
 * `MAX_GOAL_TRACK_DOTS`: un obiettivo si guarda per capire se è ancora vivo,
 * e le sedute di un anno fa non rispondono a quella domanda.
 *
 * L'obiettivo principale sta sempre in cima — è quello che dà il nome al
 * lavoro — e sotto vale l'ordine deciso dal coach.
 */
export function buildJourneyGoalRows(params: {
  goals: readonly StoredJourneyGoal[];
  timeline: readonly MentalJourneyEntry[];
  /** Il legame scritto: quali sedute hanno toccato quale obiettivo. */
  links: GoalSessionLinks;
  maxDots?: number;
}): JourneyGoalRow[] {
  const maxDots = params.maxDots ?? MAX_GOAL_TRACK_DOTS;

  // La timeline arriva dalla più recente: qui si legge da sinistra a destra.
  const chronological = [...params.timeline].sort((left, right) => {
    const a = left.sessionDate ? Date.parse(left.sessionDate) : Number.MAX_SAFE_INTEGER;
    const b = right.sessionDate ? Date.parse(right.sessionDate) : Number.MAX_SAFE_INTEGER;
    return a - b;
  });
  const visible = chronological.slice(-maxDots);

  return [...params.goals]
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      if (left.position !== right.position) return left.position - right.position;
      return left.id - right.id;
    })
    .map((goal) => {
      const touchedIn = params.links.get(goal.id) ?? new Set<number>();

      const track = visible.map((entry) => ({
        sessionId: entry.sessionId,
        sessionDate: entry.sessionDate,
        touched: touchedIn.has(entry.sessionId),
        href: `${entry.compassHref}#session-compass`,
      }));

      const lastTouched = [...track].reverse().find((dot) => dot.touched);

      return {
        id: goal.id,
        title: goal.title,
        isPrimary: goal.isPrimary,
        status: goal.status,
        track,
        lastTouchedAt: lastTouched?.sessionDate ?? null,
        updatedAt: goal.updatedAt.toISOString(),
        isTracked: track.some((dot) => dot.touched),
      };
    });
}

/**
 * I temi che un coach può agganciare a un obiettivo: quelli che il Compass ha
 * visto tornare almeno due volte. Proporre un tema comparso una volta sola
 * significherebbe promettere una traccia che resterà quasi tutta vuota.
 */
export function selectableGoalThemes(
  themes: readonly RecurringTheme[]
): Array<{ key: string; label: string; occurrences: number }> {
  return themes.map((theme) => ({
    key: theme.key,
    label: theme.label,
    occurrences: theme.occurrences,
  }));
}

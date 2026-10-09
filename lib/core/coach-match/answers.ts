/**
 * Le risposte del wizard «Aiutami a scegliere» e la loro pulizia.
 *
 * Le risposte arrivano da un client non fidato (anche anonimo): qui si
 * riducono a un oggetto con soli valori ammessi, con il testo libero limitato
 * in lunghezza. Il resto del modulo lavora solo su questo oggetto.
 *
 * Modulo puro, senza `server-only`: lo leggono il wizard (client) e il server.
 */

export const MAX_FREE_TEXT_LENGTH = 600;
export const MAX_THEMES_SELECTED = 2;

/** Cosa l'atleta vuole migliorare, e le specialità del coach che lo coprono. */
export const MATCH_THEMES = [
  {
    key: 'anxiety',
    label: 'Ansia e pressione prima della gara',
    specialtyKeys: ['performance_anxiety', 'pre_competition_routine'],
  },
  {
    key: 'focus',
    label: 'Concentrazione',
    specialtyKeys: ['focus_concentration', 'pre_competition_routine'],
  },
  {
    key: 'confidence',
    label: 'Fiducia in me stesso',
    specialtyKeys: ['confidence', 'resilience'],
  },
  {
    key: 'mistakes',
    label: 'Gestire errori e sconfitte',
    specialtyKeys: ['resilience', 'confidence'],
  },
  {
    key: 'motivation',
    label: 'Motivazione e costanza',
    specialtyKeys: ['motivation', 'goal_setting'],
  },
  {
    key: 'injury',
    label: 'Tornare dopo un infortunio',
    specialtyKeys: ['injury_recovery', 'confidence'],
  },
  {
    key: 'team',
    label: 'Squadra, allenatore, rapporti',
    specialtyKeys: ['team_dynamics'],
  },
] as const;

export type MatchThemeKey = (typeof MATCH_THEMES)[number]['key'];

/** In quale momento l'atleta sente di più la difficoltà (contesto per il testo, non un filtro). */
export const MATCH_MOMENTS = [
  { key: 'before', label: 'Prima della gara' },
  { key: 'during', label: 'Durante la gara' },
  { key: 'after', label: 'Dopo un errore o una sconfitta' },
  { key: 'training', label: 'In allenamento' },
  { key: 'outside', label: 'Fuori dallo sport' },
] as const;
export type MatchMomentKey = (typeof MATCH_MOMENTS)[number]['key'];

/** Lo stile di lavoro preferito: guida solo il confronto con la presentazione dei coach. */
export const MATCH_STYLES = [
  { key: 'direct', label: 'Diretto e concreto', hint: 'diretto, concreto, orientato all’azione' },
  { key: 'empathic', label: 'Empatico, di ascolto', hint: 'empatico, accogliente, di ascolto' },
  { key: 'structured', label: 'Strutturato, con esercizi', hint: 'metodico, strutturato, con esercizi e percorsi' },
  { key: 'sport_specific', label: 'Esperto del mio sport', hint: 'esperienza nello sport specifico dell’atleta' },
] as const;
export type MatchStyleKey = (typeof MATCH_STYLES)[number]['key'];

export type MatchAnswers = {
  sport: string | null;
  level: string | null;
  themes: MatchThemeKey[];
  moments: MatchMomentKey[];
  freeText: string;
  styles: MatchStyleKey[];
  /** Budget massimo a seduta, in centesimi; null = non importa. */
  budgetMaxCents: number | null;
};

const THEME_KEYS = new Set<string>(MATCH_THEMES.map((t) => t.key));
const MOMENT_KEYS = new Set<string>(MATCH_MOMENTS.map((m) => m.key));
const STYLE_KEYS = new Set<string>(MATCH_STYLES.map((s) => s.key));

function pickKeys<T extends string>(value: unknown, allowed: Set<string>, max: number): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const v of value) {
    if (typeof v === 'string' && allowed.has(v) && !out.includes(v as T)) out.push(v as T);
    if (out.length >= max) break;
  }
  return out;
}

function shortKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^[a-z0-9_]{1,40}$/.test(v) ? v : null;
}

/** Riduce un corpo non fidato a risposte valide; mai un'eccezione. */
export function normalizeMatchAnswers(raw: unknown): MatchAnswers {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const text = typeof r.freeText === 'string' ? r.freeText.replace(/\s+/g, ' ').trim() : '';
  const budget = typeof r.budgetMaxCents === 'number' && Number.isFinite(r.budgetMaxCents) ? Math.round(r.budgetMaxCents) : null;
  return {
    sport: shortKey(r.sport),
    level: shortKey(r.level),
    themes: pickKeys<MatchThemeKey>(r.themes, THEME_KEYS, MAX_THEMES_SELECTED),
    moments: pickKeys<MatchMomentKey>(r.moments, MOMENT_KEYS, MATCH_MOMENTS.length),
    freeText: text.slice(0, MAX_FREE_TEXT_LENGTH),
    styles: pickKeys<MatchStyleKey>(r.styles, STYLE_KEYS, 2),
    budgetMaxCents: budget != null && budget > 0 ? Math.min(budget, 1_000_000) : null,
  };
}

/** Le risposte hanno abbastanza per cercare? Serve almeno un tema o un testo. */
export function hasEnoughToMatch(answers: MatchAnswers): boolean {
  return answers.themes.length > 0 || answers.freeText.length >= 10;
}

const DISTRESS_PATTERNS: RegExp[] = [
  /suicid/i,
  /farla finita/i,
  /togliermi la vita/i,
  /uccidermi/i,
  /non voglio piu vivere/i,
  /non voglio più vivere/i,
  /farmi del male/i,
  /autolesion/i,
  /non ce la faccio piu a vivere/i,
  /meglio morire/i,
];

/**
 * Il testo contiene segnali di un disagio che non è materia di un abbinamento?
 * In quel caso il wizard mostra, sopra i risultati, dove chiedere aiuto subito.
 * Non è una diagnosi: un controllo prudente su poche espressioni esplicite.
 */
export function mentionsDistress(text: string): boolean {
  return DISTRESS_PATTERNS.some((p) => p.test(text));
}

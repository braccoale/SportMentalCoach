/**
 * Quanto è completo il profilo di un coach, e cosa gli manca.
 *
 * Perché esiste: gli atleti cercano per sport, specialità, livello e lingua, e
 * un coach che non ha compilato quei campi **non compare** in quei risultati;
 * in più il profilo è la prima cosa che si legge prima di chiedere una seduta.
 * Il punteggio dice al coach cosa c'è, cosa manca e, per ogni voce, perché
 * conta. Entra anche nell'ordine dell'elenco con un peso regolabile
 * (`lib/core/listings/ranking.ts`).
 *
 * Regole di scrittura:
 *  - il peso di una voce riflette quanto serve a chi sceglie, non quanto è
 *    facile da compilare: una bio di una riga non vale come una scritta bene;
 *  - una voce può valere **metà** (`partial`): chi ha fatto un pezzo non deve
 *    sentirsi a zero;
 *  - niente numeri sulle conseguenze che non abbiamo misurato: i motivi sono
 *    quelli che il prodotto fa davvero (i filtri, la scheda, le richieste);
 *  - contano solo cose che **il coach può fare da solo**: la verifica dei
 *    titoli da parte del team e la sessione conoscitiva gratuita (decisa dalla
 *    piattaforma) non entrano nel punteggio;
 *  - le voci «di struttura» (foto, sport, lingue, servizio, orari…) pesano
 *    meno di quelle di contenuto (presentazione, video, titoli, esperienza):
 *    averle è il minimo per funzionare, non un merito, e un profilo con tutta
 *    la struttura ma senza contenuto non deve sembrare «buono».
 *
 * Modulo puro, senza `server-only`: lo leggono la pagina del profilo e
 * l'elenco dei coach.
 */

export type CoachProfileInput = {
  hasPhoto: boolean;
  headline: string | null;
  description: string | null;
  categories: string[] | null;
  specialties: string[] | null;
  athleteLevels: string[] | null;
  languages: string[] | null;
  coachSince: string | null;
  yearsExperience: number | null;
  certifications: string[] | null;
  hasVideo: boolean;
  /** Almeno un servizio attivo, non conoscitivo, con una durata. */
  hasService: boolean;
  /** … e con anche un prezzo. */
  hasPricedService: boolean;
  hasAvailability: boolean;
};

export type CompletenessState = 'done' | 'partial' | 'missing';

export type CompletenessItem = {
  key: string;
  label: string;
  /** Punti massimi della voce; la somma di tutte è 100. */
  weight: number;
  earned: number;
  state: CompletenessState;
  /** Cosa fare, in una frase. */
  hint: string;
  /** Perché conta, per chi sceglie un coach. */
  why: string;
};

export type CompletenessLevel = 'base' | 'buono' | 'ottimo' | 'completo';

export type ProfileCompleteness = {
  /** 0–100. */
  score: number;
  level: CompletenessLevel;
  items: CompletenessItem[];
  /** Le voci non finite che farebbero guadagnare di più, al massimo quattro. */
  nextSteps: CompletenessItem[];
};

export const COMPLETENESS_LEVEL_LABEL: Record<CompletenessLevel, string> = {
  base: 'Base',
  buono: 'Buono',
  ottimo: 'Ottimo',
  completo: 'Completo',
};

/** Soglie del livello: da 90 in su è «Completo», da 75 «Ottimo», da 55 «Buono». */
export function completenessLevel(score: number): CompletenessLevel {
  if (score >= 90) return 'completo';
  if (score >= 75) return 'ottimo';
  if (score >= 55) return 'buono';
  return 'base';
}

const count = (list: string[] | null): number =>
  (list ?? []).filter((v) => v.trim().length > 0).length;
const len = (text: string | null): number => (text ?? '').trim().length;

type Spec = {
  key: string;
  label: string;
  weight: number;
  hint: string;
  why: string;
  /** Da 0 a 1: la frazione del peso guadagnata. */
  fraction: (p: CoachProfileInput) => number;
};

const SPECS: Spec[] = [
  // ── Struttura: il minimo per funzionare (42 punti) ──────────────────────
  {
    key: 'photo',
    label: 'Foto del profilo',
    weight: 10,
    hint: 'Carica una foto del tuo volto, ben illuminata e riconoscibile.',
    why: 'È la prima cosa che si guarda nell’elenco: un volto aiuta a fidarsi prima ancora di leggere.',
    fraction: (p) => (p.hasPhoto ? 1 : 0),
  },
  {
    key: 'sports',
    label: 'Sport che segui',
    weight: 6,
    hint: 'Scegli almeno uno sport.',
    why: 'Senza uno sport non compari quando un atleta filtra per sport.',
    fraction: (p) => (count(p.categories) >= 1 ? 1 : 0),
  },
  {
    key: 'specialties',
    label: 'Specialità',
    weight: 8,
    hint: 'Indica almeno due temi su cui lavori (per esempio ansia pre-gara, concentrazione).',
    why: 'Gli atleti cercano per tema: senza specialità non compari quando filtrano per quello che vogliono allenare.',
    fraction: (p) => (count(p.specialties) >= 2 ? 1 : count(p.specialties) === 1 ? 0.5 : 0),
  },
  {
    key: 'levels',
    label: 'Livelli degli atleti',
    weight: 4,
    hint: 'Indica con quali livelli lavori (amatori, agonisti, élite…).',
    why: 'Serve al filtro «lavora con»: chi cerca un coach per il proprio livello ti trova.',
    fraction: (p) => (count(p.athleteLevels) >= 1 ? 1 : 0),
  },
  {
    key: 'languages',
    label: 'Lingue',
    weight: 4,
    hint: 'Aggiungi le lingue in cui puoi fare le sedute.',
    why: 'Senza lingue non compari quando un atleta filtra per la propria lingua.',
    fraction: (p) => (count(p.languages) >= 1 ? 1 : 0),
  },
  {
    key: 'service',
    label: 'Servizio con durata e prezzo',
    weight: 6,
    hint: 'Crea almeno un servizio attivo con la durata e il prezzo.',
    why: 'Senza un servizio con una durata nessuno può chiederti una seduta; con il prezzo compari anche nel filtro prezzo.',
    fraction: (p) => (p.hasPricedService ? 1 : p.hasService ? 0.5 : 0),
  },
  {
    key: 'availability',
    label: 'Disponibilità settimanale',
    weight: 4,
    hint: 'Pubblica i giorni e gli orari in cui ricevi.',
    why: 'Senza orari pubblicati l’atleta non può scegliere uno spazio e chiederti una seduta.',
    fraction: (p) => (p.hasAvailability ? 1 : 0),
  },
  // ── Contenuto: ciò che convince a sceglierti (58 punti) ─────────────────
  {
    key: 'headline',
    label: 'Titolo',
    weight: 7,
    hint: 'Scrivi una frase che dica chi sei e con chi lavori (almeno 15 caratteri).',
    why: 'Compare sulla tua scheda nell’elenco, sotto il nome.',
    fraction: (p) => (len(p.headline) >= 15 ? 1 : 0),
  },
  {
    key: 'bio',
    label: 'Presentazione',
    weight: 18,
    hint: 'Racconta come lavori, con chi e su cosa: almeno 300 caratteri per un testo che convince.',
    why: 'È il testo che si legge prima di chiedere la sessione conoscitiva. Più è chiaro, meno domande restano all’atleta.',
    fraction: (p) => (len(p.description) >= 300 ? 1 : len(p.description) >= 150 ? 0.5 : 0),
  },
  {
    key: 'experience',
    label: 'Esperienza',
    weight: 8,
    hint: 'Indica da quando fai il coach.',
    why: 'Gli anni di attività sono un segnale di fiducia mostrato sulla tua scheda.',
    fraction: (p) => (p.coachSince || (p.yearsExperience ?? 0) > 0 ? 1 : 0),
  },
  {
    key: 'certifications',
    label: 'Titoli e formazione',
    weight: 10,
    hint: 'Elenca i titoli e i percorsi di formazione che hai davvero.',
    why: 'Rendono credibile il profilo. Scrivi solo ciò che puoi dimostrare.',
    fraction: (p) => (count(p.certifications) >= 1 ? 1 : 0),
  },
  {
    key: 'video',
    label: 'Video di presentazione',
    weight: 15,
    hint: 'Registra un video breve in cui ti presenti.',
    why: 'Fa sentire la tua voce e il tuo modo di parlare prima della sessione conoscitiva.',
    fraction: (p) => (p.hasVideo ? 1 : 0),
  },
];

export function computeProfileCompleteness(input: CoachProfileInput): ProfileCompleteness {
  const items: CompletenessItem[] = SPECS.map((spec) => {
    const fraction = Math.max(0, Math.min(1, spec.fraction(input)));
    const earned = spec.weight * fraction;
    return {
      key: spec.key,
      label: spec.label,
      weight: spec.weight,
      earned,
      state: fraction >= 1 ? 'done' : fraction > 0 ? 'partial' : 'missing',
      hint: spec.hint,
      why: spec.why,
    };
  });

  const score = Math.round(items.reduce((sum, item) => sum + item.earned, 0));
  const nextSteps = items
    .filter((item) => item.state !== 'done')
    .sort((a, b) => b.weight - b.earned - (a.weight - a.earned))
    .slice(0, 4);

  return { score, level: completenessLevel(score), items, nextSteps };
}

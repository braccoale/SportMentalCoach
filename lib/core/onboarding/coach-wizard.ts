/**
 * Le regole pure del wizard di benvenuto del coach: i passi, i modelli di
 * orario, e come si passa dagli «anni di esperienza» (che un coach sa dire) a
 * «Coach dal» (che il profilo conserva).
 *
 * Modulo puro, senza `server-only`: lo leggono il wizard nel browser, le azioni
 * sul server e i test.
 */

export type CoachWizardStepKey =
  | 'welcome'
  | 'who'
  | 'what'
  | 'story'
  | 'experience'
  | 'service'
  | 'hours'
  | 'video'
  | 'review';

export type CoachWizardStep = {
  key: CoachWizardStepKey;
  label: string;
  /** Si può passare oltre senza compilare. */
  optional: boolean;
};

/**
 * I passi, uno per idea. Si salva a ogni passo e si riprende da dove ci si era
 * fermati (l'indice è quello salvato in `onboarding_state.step`).
 */
export const COACH_WIZARD_STEPS: CoachWizardStep[] = [
  { key: 'welcome', label: 'Benvenuto', optional: true },
  { key: 'who', label: 'Chi sei', optional: false },
  { key: 'what', label: 'Cosa fai', optional: false },
  { key: 'story', label: 'Raccontati', optional: false },
  { key: 'experience', label: 'Esperienza', optional: true },
  { key: 'service', label: 'Il tuo servizio', optional: false },
  { key: 'hours', label: 'Quando ricevi', optional: true },
  { key: 'video', label: 'Video', optional: true },
  { key: 'review', label: 'Riepilogo', optional: false },
];

/** L'indice di un passo salvato, riportato dentro i limiti (uno stato vecchio o strano non rompe il wizard). */
export function clampWizardStep(step: number | null | undefined): number {
  if (typeof step !== 'number' || !Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.trunc(step), 0), COACH_WIZARD_STEPS.length - 1);
}

/**
 * Da «da quanti anni fai il coach» a «Coach dal»: il primo gennaio dell'anno in
 * cui ha cominciato. Con 0 anni è l'inizio di quest'anno, mai una data futura.
 */
export function coachSinceFromYears(years: number, now: Date = new Date()): string | null {
  if (!Number.isFinite(years) || years < 0 || years > 70) return null;
  return `${now.getFullYear() - Math.floor(years)}-01-01`;
}

/** L'operazione inversa, per mostrare gli anni già salvati: anni interi dall'inizio dell'anno indicato. */
export function yearsFromCoachSince(coachSince: string | null | undefined, now: Date = new Date()): number | null {
  if (!coachSince) return null;
  const year = Number(coachSince.slice(0, 4));
  if (!Number.isInteger(year) || year > now.getFullYear()) return null;
  return now.getFullYear() - year;
}

export type SlotLike = { weekday: number; startMinute: number; endMinute: number };

/**
 * Modelli di orario per chi non vuole disegnare la settimana: si scelgono, si
 * applicano, e poi si rifiniscono dalla pagina Servizi. I giorni seguono
 * l'archivio (0 = domenica … 6 = sabato).
 */
export const AVAILABILITY_PRESETS: { key: string; label: string; hint: string; slots: SlotLike[] }[] = [
  {
    key: 'sera',
    label: 'Sere nei giorni feriali',
    hint: 'dal lunedì al venerdì, 18:00–21:00',
    slots: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 18 * 60, endMinute: 21 * 60 })),
  },
  {
    key: 'mattina',
    label: 'Mattine nei giorni feriali',
    hint: 'dal lunedì al venerdì, 9:00–12:00',
    slots: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 12 * 60 })),
  },
  {
    key: 'weekend',
    label: 'Weekend',
    hint: 'sabato e domenica, 9:00–13:00',
    slots: [6, 0].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 13 * 60 })),
  },
];

const overlaps = (a: SlotLike, b: SlotLike) =>
  a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute;

/**
 * Le fasce da aggiungere per i modelli scelti, saltando quelle che si
 * sovrappongono a ciò che il coach ha già (anche a un altro modello scelto
 * insieme): rieseguire il passo, o riprenderlo, non crea doppioni né errori.
 */
export function slotsToAdd(existing: SlotLike[], presetKeys: string[]): SlotLike[] {
  const taken: SlotLike[] = [...existing];
  const add: SlotLike[] = [];
  for (const key of presetKeys) {
    const preset = AVAILABILITY_PRESETS.find((p) => p.key === key);
    if (!preset) continue;
    for (const slot of preset.slots) {
      if (taken.some((t) => overlaps(t, slot))) continue;
      taken.push(slot);
      add.push(slot);
    }
  }
  return add;
}

/** Il primo servizio proposto: ciò che quasi tutti i coach offrono. */
export const DEFAULT_FIRST_SERVICE = { title: 'Sessione individuale', durationMin: 60 } as const;

/**
 * Il prezzo scritto dal coach in euro («60», «60,50», «60.5»): `null` se vuoto
 * (nessun prezzo), un numero se valido, `'invalid'` altrimenti (testo, negativo,
 * assurdo). Il server lo ricontrolla: questo serve a dirlo subito.
 */
export function parsePriceEuro(text: string): number | null | 'invalid' {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'invalid';
  const n = Number(t);
  return Number.isFinite(n) && n <= 1_000_000 ? n : 'invalid';
}

/** L'importo in centesimi come lo scrive un coach («60,50»; vuoto se non c'è un prezzo). */
export function priceCentsToInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  const euros = cents / 100;
  return (Number.isInteger(euros) ? String(euros) : euros.toFixed(2)).replace('.', ',');
}

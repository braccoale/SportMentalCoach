/**
 * La spesa stimata dei servizi AI, e la ragione per cui spesso non c'è.
 *
 * La domanda «quanto ci costa» è legittima e la risposta onesta, oggi, è
 * **dipende da quanto ci dici tu**. In questo repository non esiste una sola
 * riga che registri il consumo fatturabile: la trascrizione non salva i
 * minuti conteggiati dal fornitore, e il riepilogo scrive i token nel log
 * (`openai-session-compass-provider.ts`) senza persisterli da nessuna parte.
 * Ricavare un costo da lì significherebbe inventarlo.
 *
 * Quindi due decisioni esplicite:
 *
 * - **Le tariffe sono configurazione, non conoscenza del dominio.** Cambiano
 *   con il contratto, con il modello, con il listino del fornitore; scriverle
 *   nel codice vorrebbe dire mostrare per mesi un numero che nessuno ha più
 *   verificato. Vivono in variabili d'ambiente.
 * - **Senza tariffe non si mostra nulla.** Non zero, non un trattino
 *   ambiguo: «non configurato», che è ciò che è. Un costo inventato in una
 *   console amministrativa è peggio di un costo assente, perché qualcuno ci
 *   costruisce sopra una decisione.
 *
 * Il conteggio dei minuti è invece reale: viene da `duration_seconds` delle
 * registrazioni effettivamente archiviate. Su quello la stima è aritmetica.
 *
 * Modulo puro: si prova senza database e senza ambiente.
 */

export type AiCostRates = {
  /** Euro per minuto di audio consegnato al fornitore di trascrizione. */
  sttPerMinute: number | null;
  /** Euro per riepilogo generato, come forfait: i token non sono persistiti. */
  reportEach: number | null;
  /** Soglia oltre la quale la spesa del periodo diventa una segnalazione. */
  alertThreshold: number | null;
};

export const AI_COST_ENV_KEYS = {
  sttPerMinute: 'AI_NOTES_COST_STT_EUR_PER_MINUTE',
  reportEach: 'AI_NOTES_COST_REPORT_EUR',
  alertThreshold: 'AI_NOTES_COST_ALERT_EUR',
} as const;

function positiveNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function readAiCostRates(
  env: Record<string, string | undefined>
): AiCostRates {
  return {
    sttPerMinute: positiveNumber(env[AI_COST_ENV_KEYS.sttPerMinute]),
    reportEach: positiveNumber(env[AI_COST_ENV_KEYS.reportEach]),
    alertThreshold: positiveNumber(env[AI_COST_ENV_KEYS.alertThreshold]),
  };
}

export function hasAnyAiCostRate(rates: AiCostRates): boolean {
  return rates.sttPerMinute !== null || rates.reportEach !== null;
}

export type AiCostUsage = {
  /** Minuti di audio archiviati nel periodo, dai secondi delle registrazioni. */
  audioMinutes: number;
  /** Riepiloghi effettivamente generati nel periodo. */
  reportsGenerated: number;
  /** Sedute che hanno prodotto almeno un riepilogo: il denominatore onesto. */
  sessionsWithReport: number;
};

export type AiCostEstimate = {
  /** `null` quando la tariffa corrispondente non è configurata. */
  sttEur: number | null;
  reportEur: number | null;
  totalEur: number | null;
  /** Costo medio per seduta, solo con un totale e un denominatore veri. */
  perSessionEur: number | null;
  /** Vero quando il totale supera la soglia configurata. */
  overThreshold: boolean;
  threshold: number | null;
};

/**
 * La stima, o l'assenza di stima.
 *
 * Il totale è `null` se **nessuna** delle due tariffe è configurata. Con una
 * sola configurata il totale esiste ma è parziale, e la console lo dichiara:
 * meglio «solo trascrizione» che un totale che finge di essere completo.
 */
export function estimateAiCost(
  usage: AiCostUsage,
  rates: AiCostRates
): AiCostEstimate {
  const sttEur =
    rates.sttPerMinute === null
      ? null
      : round2(Math.max(0, usage.audioMinutes) * rates.sttPerMinute);
  const reportEur =
    rates.reportEach === null
      ? null
      : round2(Math.max(0, usage.reportsGenerated) * rates.reportEach);

  const totalEur =
    sttEur === null && reportEur === null
      ? null
      : round2((sttEur ?? 0) + (reportEur ?? 0));

  const perSessionEur =
    totalEur === null || usage.sessionsWithReport <= 0
      ? null
      : round2(totalEur / usage.sessionsWithReport);

  return {
    sttEur,
    reportEur,
    totalEur,
    perSessionEur,
    overThreshold:
      totalEur !== null &&
      rates.alertThreshold !== null &&
      totalEur > rates.alertThreshold,
    threshold: rates.alertThreshold,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * L'importo come lo legge una persona.
 *
 * Formattazione fatta a mano e non con `Intl.NumberFormat`: il runner di CI
 * gira con una ICU ridotta e la stessa cifra esce con un separatore diverso,
 * il che rende instabile qualunque verifica su un valore mostrato.
 */
export function formatEur(value: number | null): string {
  if (value === null) return 'non configurato';
  const [intero, decimali] = value.toFixed(2).split('.');
  const raggruppato = intero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${raggruppato},${decimali} €`;
}

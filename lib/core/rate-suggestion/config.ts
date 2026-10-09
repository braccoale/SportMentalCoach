/**
 * Le fasce di tariffa suggerita come parametri di sistema: l'admin le cambia
 * dalla pagina «Configurazione di sistema» senza rilasciare codice (stessa
 * tabella e stessa pagina degli altri parametri).
 *
 * Quindici numeri: per ognuno dei quattro livelli il minimo, il massimo e il
 * suggerito (euro per 60 minuti), e le tre soglie di punteggio per entrare in
 * Consolidato, Esperto e Senior. I valori in codice (`RATE_LEVELS`) sono il
 * predefinito: valgono se una riga manca o se l'insieme non è coerente.
 *
 * Coerenza = una regola sola, tutta insieme: dentro un livello
 * min ≤ suggerito ≤ max, le soglie crescenti, e i livelli che salgono (il
 * minimo di un livello non scende sotto quello del precedente, idem il
 * massimo). Se anche un solo valore la rompe, si torna *a tutti* i predefiniti:
 * mezza tabella nuova e mezza vecchia darebbe fasce che nessuno ha deciso.
 *
 * Modulo puro, senza `server-only`: lo leggono la parte server e i test.
 */
import { RATE_LEVELS, type RateLevel, type RateLevelKey } from './index';

export const RATE_CONFIG_CATEGORY = 'tariffe';

const LEVEL_KEYS: RateLevelKey[] = ['avvio', 'consolidato', 'esperto', 'senior'];

const upper = (k: RateLevelKey) => k.toUpperCase();

export const rateConfigKey = {
  min: (k: RateLevelKey) => `RATE_${upper(k)}_MIN`,
  max: (k: RateLevelKey) => `RATE_${upper(k)}_MAX`,
  suggested: (k: RateLevelKey) => `RATE_${upper(k)}_SUGGESTED`,
  minScore: (k: RateLevelKey) => `RATE_${upper(k)}_MIN_SCORE`,
};

export type RateConfigRow = {
  key: string;
  defaultValue: number;
  label: string;
  description: string;
};

const LABEL: Record<RateLevelKey, string> = {
  avvio: 'Avvio',
  consolidato: 'Consolidato',
  esperto: 'Esperto',
  senior: 'Senior',
};

/** Tutte le righe di configurazione, con il predefinito preso da `RATE_LEVELS`. */
export function rateConfigRows(): RateConfigRow[] {
  const rows: RateConfigRow[] = [];
  for (const level of RATE_LEVELS) {
    const name = LABEL[level.key];
    rows.push(
      {
        key: rateConfigKey.min(level.key),
        defaultValue: level.min,
        label: `Tariffa suggerita, livello ${name}: minimo (€/ora)`,
        description: `Limite basso della fascia oraria del livello ${name}, in euro per 60 minuti.`,
      },
      {
        key: rateConfigKey.max(level.key),
        defaultValue: level.max,
        label: `Tariffa suggerita, livello ${name}: massimo (€/ora)`,
        description: `Limite alto della fascia oraria del livello ${name}, in euro per 60 minuti.`,
      },
      {
        key: rateConfigKey.suggested(level.key),
        defaultValue: level.suggested,
        label: `Tariffa suggerita, livello ${name}: prezzo suggerito (€/ora)`,
        description: `Prezzo consigliato al coach del livello ${name}, in euro per 60 minuti. Deve stare fra minimo e massimo.`,
      }
    );
    if (level.key !== 'avvio') {
      rows.push({
        key: rateConfigKey.minScore(level.key),
        defaultValue: level.minScore,
        label: `Tariffa suggerita: punteggio per il livello ${name}`,
        description: `Punteggio minimo (da 1 a 100) per entrare nel livello ${name}. Le soglie devono crescere da un livello al successivo.`,
      });
    }
  }
  return rows;
}

/** Tutte le chiavi lette dalla funzione, per chi deve leggerle dal database. */
export const RATE_CONFIG_KEYS: string[] = rateConfigRows().map((r) => r.key);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** I livelli dai valori letti (`undefined` = riga mancante), o i predefiniti se mancano o sono incoerenti. */
export function resolveRateLevels(values: Record<string, number | undefined>): RateLevel[] {
  const levels: RateLevel[] = LEVEL_KEYS.map((key, i) => {
    const base = RATE_LEVELS[i];
    const pick = (cfgKey: string, fallback: number) => (isNum(values[cfgKey]) ? (values[cfgKey] as number) : fallback);
    return {
      key,
      label: base.label,
      minScore: key === 'avvio' ? 0 : Math.round(pick(rateConfigKey.minScore(key), base.minScore)),
      min: pick(rateConfigKey.min(key), base.min),
      max: pick(rateConfigKey.max(key), base.max),
      suggested: pick(rateConfigKey.suggested(key), base.suggested),
    };
  });

  const coherent = levels.every((l, i) => {
    if (!(l.min <= l.suggested && l.suggested <= l.max)) return false;
    if (i === 0) return true;
    const prev = levels[i - 1];
    return l.minScore > prev.minScore && l.minScore <= 100 && l.min >= prev.min && l.max >= prev.max;
  });
  return coherent ? levels : RATE_LEVELS.map((l) => ({ ...l }));
}

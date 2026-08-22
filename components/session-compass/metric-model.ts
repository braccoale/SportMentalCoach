import type {
  SessionMetric,
  SessionMetricKey,
} from '@/lib/core/ai-session-notes/session-compass-contract';

/**
 * Le sei metriche, e che cosa vogliono dire.
 *
 * `definition` è nato da una domanda a cui il prodotto non sapeva rispondere:
 * da nessuna parte, in nessuna schermata, era scritto che cosa significhi
 * «Gestione emotiva» o che cosa dica un 2 su 5. Sei parole tecniche mostrate
 * come se fossero ovvie, a chi legge un testo su una persona che ha in cura.
 *
 * Sono definizioni **linguistiche di proposito**: dicono sempre «ha detto»,
 * «ha descritto», «ha espresso». Non è uno stile di scrittura. Il modello
 * riceve la trascrizione e nient'altro, e la classificazione AI Act del
 * prodotto si regge esattamente su questo (`docs/13_AI_Act.md`): una
 * definizione che promettesse di misurare come l'atleta *sta* descriverebbe un
 * sistema diverso da quello che gira.
 */
export const METRIC_META: Record<
  SessionMetricKey,
  {
    label: string;
    shortLabel: string;
    color: string;
    higherIsBetter: boolean;
    /** Che cos'è, in una riga, per chi la legge la prima volta. */
    definition: string;
  }
> = {
  energy: {
    label: 'Energia',
    shortLabel: 'Energia',
    color: '#f59e0b',
    higherIsBetter: true,
    definition:
      'quanta energia e voglia di spendersi l’atleta ha espresso parlando',
  },
  motivation: {
    label: 'Motivazione',
    shortLabel: 'Motivazione',
    color: '#ec4899',
    higherIsBetter: true,
    definition:
      'quanto ha parlato dei propri obiettivi come di qualcosa che vuole davvero perseguire',
  },
  concentration: {
    label: 'Concentrazione',
    shortLabel: 'Focus',
    color: '#2563eb',
    higherIsBetter: true,
    definition:
      'quanto ha descritto di riuscire a restare sul compito senza disperdersi',
  },
  emotional_management: {
    label: 'Gestione emotiva',
    shortLabel: 'Gestione emotiva',
    color: '#059669',
    higherIsBetter: true,
    definition:
      'quanto ha descritto di riuscire a gestire ciò che prova — non quanto stia bene',
  },
  confidence: {
    label: 'Fiducia',
    shortLabel: 'Fiducia',
    color: '#7c3aed',
    higherIsBetter: true,
    definition: 'quanta fiducia nei propri mezzi ha espresso parlando di sé',
  },
  pre_competition_anxiety: {
    label: 'Ansia pre-gara',
    shortLabel: 'Ansia pre-gara',
    color: '#e11d48',
    higherIsBetter: false,
    definition: 'quanta tensione ha descritto in vista della gara',
  },
};

export type MetricDelta = {
  key: SessionMetricKey;
  label: string;
  current: number;
  previous: number;
  delta: number;
  direction: 'improved' | 'stable' | 'attention';
};

export function compareSessionMetrics(
  current: readonly SessionMetric[],
  previous: readonly { key: SessionMetricKey; value: number }[]
): MetricDelta[] {
  const previousByKey = new Map(previous.map((metric) => [metric.key, metric.value]));
  return current.flatMap((metric) => {
    const previousValue = previousByKey.get(metric.key);
    if (previousValue === undefined) return [];
    const delta = metric.value - previousValue;
    const favorableDelta = METRIC_META[metric.key].higherIsBetter ? delta : -delta;
    return [{
      key: metric.key,
      label: METRIC_META[metric.key].label,
      current: metric.value,
      previous: previousValue,
      delta,
      direction: favorableDelta >= 1 ? 'improved' : favorableDelta <= -1 ? 'attention' : 'stable',
    }];
  });
}

/**
 * Frase di confronto per una scala ordinale 1–5: mai percentuali, mai
 * variazioni continue. "Punto" è l'unica unità che la scala consente.
 */
export function metricDeltaSentence(delta: MetricDelta): string {
  if (delta.delta === 0) return `${delta.label}: stabile a ${delta.current}/5`;
  const points = Math.abs(delta.delta) === 1 ? '1 punto' : `${Math.abs(delta.delta)} punti`;
  const direction = delta.delta > 0 ? 'aumentata' : 'diminuita';
  return `${delta.label}: da ${delta.previous}/5 a ${delta.current}/5 · ${direction} di ${points}`;
}

export function metricValueLabel(value: number): string {
  if (value <= 1) return 'Molto basso';
  if (value === 2) return 'Basso';
  if (value === 3) return 'Intermedio';
  if (value === 4) return 'Alto';
  return 'Molto alto';
}

/**
 * La provenienza, in coda a ogni spiegazione.
 *
 * Sta in una costante e non ripetuta a mano perché è la frase che deve
 * comparire ovunque si mostri una di queste stime, e una frase copiata sette
 * volte è una frase che fra sei mesi dice sette cose leggermente diverse.
 */
export const METRIC_PROVENANCE =
  'Ricavato dalle parole dette in seduta, non dal tono della voce.';

/**
 * Il testo che compare passando sopra un elemento di un grafico.
 *
 * Tre parti, sempre nello stesso ordine: **che cos'è**, **che cosa dice
 * questo valore qui**, **da dove viene**. Un tooltip che si limita a ripetere
 * il numero già stampato sotto il cursore non aggiunge niente — ed è quello
 * che facevano quasi tutti quelli che c'erano prima.
 *
 * Per l'ansia pre-gara aggiunge una riga in più: è l'unica metrica in cui un
 * valore alto è una cattiva notizia, e né il colore né la lunghezza della
 * barra lo dicono.
 */
export function metricTooltip(
  key: SessionMetricKey,
  value?: number,
  confidence?: SessionMetric['confidence']
): string {
  const meta = METRIC_META[key];
  const parts = [`${meta.label} — ${meta.definition}.`];

  if (value !== undefined) {
    const reading = `${value} su 5: ${metricValueLabel(value).toLocaleLowerCase('it')}`;
    parts.push(
      meta.higherIsBetter
        ? `${reading}.`
        : `${reading} — qui un valore alto segnala più tensione, non un progresso.`
    );
  }

  if (confidence) {
    parts.push(
      `Confidenza ${metricConfidenceLabel(confidence)}: ${METRIC_CONFIDENCE_EXPLANATION[confidence]}`
    );
  }

  parts.push(METRIC_PROVENANCE);
  return parts.join(' ');
}

export function metricConfidenceLabel(
  value: SessionMetric['confidence']
): string {
  return value === 'high' ? 'alta' : value === 'medium' ? 'media' : 'bassa';
}

/**
 * Che cosa vuol dire davvero «confidenza bassa».
 *
 * Non è «la stima è sbagliata»: è «la frase su cui poggia era una sola, o
 * detta di sfuggita». La differenza cambia che cosa il coach fa dopo.
 */
const METRIC_CONFIDENCE_EXPLANATION: Record<
  SessionMetric['confidence'],
  string
> = {
  high: 'più passaggi della seduta dicono la stessa cosa.',
  medium: 'il segnale c’è ma non è ripetuto: vale la pena leggere la citazione.',
  low: 'poggia su un solo passaggio, magari detto di sfuggita: leggi la citazione prima di darlo per buono.',
};

export function buildMetricTrendNarrative(
  sessions: readonly { metrics: readonly { key: SessionMetricKey; value: number }[] }[]
): string | null {
  const observations = (Object.keys(METRIC_META) as SessionMetricKey[]).flatMap((key) => {
    const values = sessions.flatMap((session) => {
      const metric = session.metrics.find((item) => item.key === key);
      return metric ? [metric.value] : [];
    });
    if (values.length < 2) return [];
    const delta = values.at(-1)! - values[0];
    const favorableDelta = METRIC_META[key].higherIsBetter ? delta : -delta;
    return [{ key, count: values.length, favorableDelta }];
  });
  if (!observations.length) return null;

  const moving = observations
    .filter((item) => Math.abs(item.favorableDelta) >= 1)
    .sort((left, right) => Math.abs(right.favorableDelta) - Math.abs(left.favorableDelta));
  const stable = observations.filter((item) => Math.abs(item.favorableDelta) < 1);
  const parts: string[] = moving.slice(0, 2).map((item) =>
    `${METRIC_META[item.key].label.toLocaleLowerCase('it')} ${item.favorableDelta > 0 ? 'in miglioramento' : 'da monitorare'}`
  );
  if (stable.length) {
    parts.push(`${stable.slice(0, 2).map((item) => METRIC_META[item.key].label.toLocaleLowerCase('it')).join(' e ')} ${stable.length === 1 ? 'stabile' : 'stabili'}`);
  }
  if (!parts.length) return null;
  const maxCount = Math.max(...observations.map((item) => item.count));
  return `Su ${maxCount} sessioni confrontabili: ${parts.join('; ')}. La lettura usa esclusivamente le stime con evidenza presenti nei report.`;
}

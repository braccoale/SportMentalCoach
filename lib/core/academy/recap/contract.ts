export const ACADEMY_RECAP_SCHEMA_VERSION = '1.0' as const;
export const MAX_KEY_CONCEPTS = 5;

export type AcademyRecapGenerationMetadata = {
  provider: string;
  model: string;
  generatedAt: string;
};

/**
 * Il recap di una sessione Academy — sempre uno per sessione, mai uno per
 * partecipante: nasce da un'unica trascrizione di gruppo, quindi il
 * contenuto è lo stesso per chiunque possa vederlo. Niente valutazione
 * della persona: non un giudizio su un singolo coach, non un punteggio di
 * personalità, non un derivato dal tempo di parola — solo cosa è stato
 * detto nella sessione.
 */
export type AcademyRecapContent = {
  schemaVersion: typeof ACADEMY_RECAP_SCHEMA_VERSION;
  /** Al massimo 5 — è un recap, non una trascrizione riformattata. */
  keyConcepts: string[];
  toolsAndProtocols: string[];
  practicalCases: string[];
  openQuestions: string[];
  nextAction: string;
  topicsCovered: string[];
  generation: AcademyRecapGenerationMetadata;
};

export type RecapValidationIssue = {
  field: string;
  message: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Verifica pura del contratto — nessuna I/O, usata sia sull'output del
 * provider reale sia nei test. Un output che non rispetta questo non
 * raggiunge mai il database.
 */
export function validateAcademyRecapContent(value: unknown): RecapValidationIssue[] {
  const issues: RecapValidationIssue[] = [];
  if (typeof value !== 'object' || value === null) {
    return [{ field: 'root', message: 'Il recap deve essere un oggetto.' }];
  }
  const content = value as Partial<AcademyRecapContent>;

  if (content.schemaVersion !== ACADEMY_RECAP_SCHEMA_VERSION) {
    issues.push({ field: 'schemaVersion', message: 'Versione dello schema non riconosciuta.' });
  }
  if (!isStringArray(content.keyConcepts)) {
    issues.push({ field: 'keyConcepts', message: 'keyConcepts deve essere una lista di stringhe.' });
  } else if (content.keyConcepts.length > MAX_KEY_CONCEPTS) {
    issues.push({ field: 'keyConcepts', message: `Al massimo ${MAX_KEY_CONCEPTS} concetti chiave.` });
  }
  if (!isStringArray(content.toolsAndProtocols)) {
    issues.push({ field: 'toolsAndProtocols', message: 'toolsAndProtocols deve essere una lista di stringhe.' });
  }
  if (!isStringArray(content.practicalCases)) {
    issues.push({ field: 'practicalCases', message: 'practicalCases deve essere una lista di stringhe.' });
  }
  if (!isStringArray(content.openQuestions)) {
    issues.push({ field: 'openQuestions', message: 'openQuestions deve essere una lista di stringhe.' });
  }
  if (!isNonEmptyString(content.nextAction)) {
    issues.push({ field: 'nextAction', message: 'nextAction non può essere vuoto.' });
  }
  if (!isStringArray(content.topicsCovered)) {
    issues.push({ field: 'topicsCovered', message: 'topicsCovered deve essere una lista di stringhe.' });
  }
  if (
    typeof content.generation !== 'object' ||
    content.generation === null ||
    !isNonEmptyString(content.generation.provider) ||
    !isNonEmptyString(content.generation.model) ||
    !isNonEmptyString(content.generation.generatedAt)
  ) {
    issues.push({ field: 'generation', message: 'Metadati di generazione mancanti o incompleti.' });
  }

  return issues;
}

/**
 * Le linee guida di casa: come entrano nel prompt e nella sua versione.
 *
 * Modulo puro. Due decisioni vivono qui, e sono le due che si sbagliano più
 * facilmente.
 *
 * La prima: **la versione delle linee guida fa parte della versione del
 * prompt**. La rigenerazione confronta la versione con cui un report è stato
 * scritto e quella corrente; se le linee guida cambiassero fuori da quel
 * confronto, l'academy aggiornerebbe il metodo e i report continuerebbero a
 * uscire con il metodo vecchio, senza che nessuno se ne accorga. È già
 * successo con il contratto del racconto, e non deve ripetersi.
 *
 * La seconda: **le linee guida orientano, non comandano**. Sono il metodo di
 * chi legge il report, non una scorciatoia per fargli dire ciò che si vuole
 * sentire. Il blocco lo dichiara al modello, perché la regola dell'evidenza
 * viene prima di qualunque metodo.
 */

/** Oltre, non è più una linea guida: è un manuale, e il modello si perde. */
export const MAX_GUIDELINES_LENGTH = 4_000;

export function isValidGuidelinesBody(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_GUIDELINES_LENGTH;
}

/**
 * La versione del prompt, comprensiva delle linee guida attive.
 *
 * Senza linee guida resta identica a prima: chi non le usa non vede cambiare
 * nulla e i suoi report non si rigenerano senza motivo.
 */
export function promptVersionWithGuidelines(
  basePromptVersion: string,
  guidelinesVersion: number | null
): string {
  const base = basePromptVersion.trim();
  if (!base) return '';
  return guidelinesVersion === null ? base : `${base}:g${guidelinesVersion}`;
}

/**
 * Il blocco da mettere in coda al prompt.
 *
 * In coda e non in testa: le regole non negoziabili — evidenza, prudenza,
 * niente diagnosi — restano le prime che il modello legge, e l'ultima cosa
 * che gli si dice è che il metodo non le scavalca.
 */
export function houseGuidelinesBlock(body: string | null): string {
  const trimmed = body?.trim();
  if (!trimmed) return '';
  return [
    'Linee guida del metodo KaiPai. Descrivono come guardare una seduta e con che tono scriverne: usale per scegliere il taglio, gli esempi e le parole.',
    'Non scavalcano nessuna delle regole precedenti: se una linea guida ti portasse a scrivere qualcosa che la trascrizione non sostiene, o a presentare una causa come un fatto, vince la regola. Il metodo orienta lo sguardo, non decide le conclusioni.',
    trimmed,
  ].join('\n');
}

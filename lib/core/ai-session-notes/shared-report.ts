import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  type SessionCompassReport,
} from './session-compass-contract';

/**
 * Che cosa dell'analisi di una seduta arriva all'atleta.
 *
 * **Il criterio, in una riga: esce ciò che si può leggere da soli senza farsi
 * male.** Il resto non è segreto — è materiale per la seduta successiva, e ha
 * bisogno di una persona accanto.
 *
 * Non è una decisione grafica. Il coach sceglie *se* condividere; **che cosa**
 * esce lo decide questa funzione, una volta, per tutti. Un interruttore per
 * sezione avrebbe messo il coach nella posizione di dover valutare ogni volta
 * se una citazione testuale fa bene a quella persona — e la risposta giusta
 * dipende da come sta l'atleta quel giorno, che è esattamente ciò che nessuna
 * interfaccia sa.
 *
 * ## Che cosa resta fuori, e perché
 *
 * - **Le occasioni mancate.** Parlano del lavoro del coach — «qui l'atleta
 *   aveva aperto uno spiraglio e la conversazione è andata altrove» — non
 *   dell'atleta. Farle leggere a lui rovescia il destinatario.
 * - **Il tono della conversazione.** Dire a qualcuno «sei sembrato reticente»
 *   è una cosa che si fa guardandolo in faccia, non su uno schermo.
 * - **Le citazioni testuali.** Rileggersi trascritti è un'esperienza diversa
 *   da quella che si immagina: una frase detta di getto, messa per iscritto,
 *   suona come una dichiarazione. Restano al coach, che le usa per verificare.
 * - **Gli indicatori numerici e l'andamento emotivo.** Un 2 su 5 in «fiducia»,
 *   letto da soli, non è una misura: è una pagella.
 * - **I momenti chiave** e la **preparazione della prossima seduta**: sono
 *   appunti di lavoro, scritti per chi conduce.
 * - **Le note private del coach**, che non escono mai da nessuna parte.
 *
 * ## Perché gli impegni non sono qui
 *
 * Arrivano già all'atleta per la loro strada, come `AthleteCommitmentView`,
 * dal momento dell'approvazione: hanno uno stato che lui stesso aggiorna, e
 * vivono più a lungo della singola seduta. Duplicarli qui creerebbe due
 * versioni della stessa cosa destinate a divergere.
 *
 * ## Perché è una fotografia e non un puntatore
 *
 * Il risultato viene salvato in `shared_report_json`, non ricalcolato a ogni
 * lettura. Se il coach corregge il report dopo aver condiviso, quello che
 * l'atleta aveva letto non deve cambiargli sotto gli occhi.
 */

export type SharedSessionReport = {
  schemaVersion: typeof SESSION_COMPASS_SCHEMA_VERSION;
  reportKind: typeof SESSION_COMPASS_REPORT_KIND;
  sessionId: string;
  /** Quando il coach ha condiviso. È la data che l'atleta vede. */
  sharedAt: string;
  /** In tre righe: di che cosa avete parlato. */
  summary: string;
  /** I filoni emersi, come frasi. Senza la citazione da cui nascono. */
  themes: string[];
  /** Una leva già presente, quando emerge. */
  emergingResource: string | null;
  /** Il racconto della seduta: la parte scritta per essere letta. */
  story: {
    title: string;
    paragraphs: string[];
    /** Il filo che lega questa seduta alle precedenti. */
    throughLine: string | null;
  } | null;
};

/**
 * Costruisce la versione destinata all'atleta.
 *
 * Aggiunge campo per campo invece di partire dal report e togliere: un campo
 * nuovo nel contratto **non** deve finire all'atleta perché nessuno si è
 * ricordato di escluderlo. Con questa forma, dimenticarsene lo tiene fuori.
 */
export function buildSharedReport(
  report: SessionCompassReport,
  sharedAt: Date
): SharedSessionReport {
  const overview = report.sessionOverview;

  return {
    schemaVersion: SESSION_COMPASS_SCHEMA_VERSION,
    reportKind: SESSION_COMPASS_REPORT_KIND,
    sessionId: report.sessionId,
    sharedAt: sharedAt.toISOString(),
    summary: overview.summary,
    themes: overview.themes.map((theme) => theme.text),
    emergingResource: overview.emergingResource?.text ?? null,
    story: report.story
      ? {
          title: report.story.title,
          paragraphs: report.story.paragraphs.map((p) => p.text),
          throughLine: report.story.throughLine,
        }
      : null,
  };
}

/**
 * C'è qualcosa da leggere?
 *
 * Un report senza racconto e senza temi produrrebbe una pagina con un titolo e
 * il vuoto sotto. Meglio non offrire la condivisione che offrirla e consegnare
 * una schermata che sembra rotta.
 */
export function sharedReportHasContent(shared: SharedSessionReport): boolean {
  return Boolean(
    shared.summary.trim() ||
      shared.themes.length > 0 ||
      (shared.story && shared.story.paragraphs.length > 0)
  );
}

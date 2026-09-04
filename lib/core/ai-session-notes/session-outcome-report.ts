/**
 * L'esito di una seduta, raccontato a chi tiene in piedi il sistema.
 *
 * Nasce da una constatazione scomoda: il 16 agosto, cinque minuti dopo aver
 * dichiarato persa un'ora di seduta, il cruscotto della pipeline era **tutto
 * verde**. E lo era davvero — la coda vuota, il worker in orario, nessuna
 * sessione bloccata. Un fallimento terminale e un successo si assomigliano
 * troppo, se guardi la coda: in entrambi i casi non resta niente da fare.
 *
 * Quindi non un altro registro delle attività — quello esiste, in
 * `pipeline-log.ts` e in `session_ai_audit_events` — ma la domanda che
 * nessuno stava facendo: *questa seduta ha prodotto un riepilogo
 * utilizzabile, e se no perché.*
 *
 * ## Cosa entra e cosa non entra
 *
 * Entra tutto ciò che serve a diagnosticare: identificativi, tempi, stati,
 * codici, la storia dei job, la traccia di audit, i messaggi veri di LiveKit.
 *
 * **Non entra una sola parola di ciò che è stato detto in seduta**, e non
 * entra il nome dell'atleta. Vale qui la stessa regola non negoziabile di
 * `pipeline-log.ts`, e vale di più: una mail esce dal sistema, passa da un
 * fornitore e si deposita in una casella. È materiale sanitario. Il coach si
 * nomina perché è un professionista sulla propria seduta; l'atleta resta un
 * numero, e quel numero basta a ritrovarlo in database quando serve.
 *
 * Modulo puro: si verifica su sedute vere senza inviare niente a nessuno.
 */

export type OutcomeVerdict = 'ok' | 'parziale' | 'fallita' | 'rifiutata';

export type OutcomeCoverage = {
  role: 'coach' | 'athlete';
  recordedSeconds: number;
  ratio: number;
  complete: boolean;
};

export type OutcomeRecording = {
  id: number;
  role: string;
  segment: number;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
};

export type OutcomeJob = {
  id: number;
  type: string;
  status: string;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export type OutcomeAuditRow = {
  at: Date;
  eventType: string;
  previousStatus: string | null;
  newStatus: string | null;
  metadata: string;
};

export type SessionOutcomeSnapshot = {
  sessionId: number;
  bookingId: number;
  /** L'atleta resta un identificativo: vedi la regola in testa al modulo. */
  athleteUserId: number;
  coachName: string;
  status: string;
  errorCode: string | null;
  scheduledFor: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  processingCompletedAt: Date | null;
  sessionSeconds: number;
  coverage: OutcomeCoverage[];
  transcriptSegments: number;
  reportId: number | null;
  /**
   * `null` quando non c'è ancora un report. Serve a scoprire il gemello della
   * seduta 181: un riepilogo consegnato regolarmente sopra zero temi, che
   * nessuno stato segnala perché la sessione è `ready_for_review` come tutte
   * le altre. Da quando `MIN_THEMES` è imposto in generazione non dovrebbe più
   * accadere — questa resta la rete sotto, non la prima difesa.
   */
  reportThemesCount: number | null;
  recordings: OutcomeRecording[];
  jobs: OutcomeJob[];
  audit: OutcomeAuditRow[];
};

const FAILED_STATUSES = ['transcription_failed', 'report_failed', 'cancelled'];
const SUCCESS_STATUSES = ['ready_for_review', 'approved', 'shared'];

/**
 * Come è andata, in una parola.
 *
 * `parziale` esiste perché è il caso che è sfuggito più a lungo: un riepilogo
 * consegnato regolarmente sopra una registrazione che aveva perso una voce
 * intera. Nessuno stato lo segnala — la sessione è `ready_for_review` come
 * tutte le altre — e per quattro giorni la seduta 181 è sembrata riuscita.
 */
export function classifySessionOutcome(
  snapshot: Pick<SessionOutcomeSnapshot, 'status' | 'coverage' | 'reportId' | 'reportThemesCount'>
): OutcomeVerdict {
  if (snapshot.status === 'consent_rejected') return 'rifiutata';
  if (FAILED_STATUSES.includes(snapshot.status)) return 'fallita';
  if (!SUCCESS_STATUSES.includes(snapshot.status)) return 'ok';
  if (snapshot.coverage.some((participant) => !participant.complete)) {
    return 'parziale';
  }
  if (snapshot.reportId !== null && snapshot.reportThemesCount === 0) {
    return 'parziale';
  }
  return 'ok';
}

const VERDICT_LABEL: Record<OutcomeVerdict, string> = {
  ok: 'OK',
  parziale: 'PARZIALE',
  fallita: 'FALLITA',
  rifiutata: 'CONSENSO RIFIUTATO',
};

/**
 * L'etichetta nell'oggetto, che non è quella nel corpo.
 *
 * Nel corpo il maiuscolo è la voce di un log incolonnato e sta bene. Nella
 * riga della posta è un tono, e il tono deve dire quanto c'è da preoccuparsi.
 *
 * `rifiutata` non è un guasto: un atleta ha esercitato un diritto, il sistema
 * ha obbedito e non ha registrato niente. Gridarlo come si grida `FALLITA`
 * insegna al coach che queste mail gridano sempre — e il giorno in cui una
 * seduta si perde davvero, quella mail ha già smesso di essere letta. Le
 * maiuscole restano dove c'è qualcosa da fare.
 */
const SUBJECT_LABEL: Record<OutcomeVerdict, string> = {
  ok: 'OK',
  parziale: 'PARZIALE',
  fallita: 'FALLITA',
  rifiutata: 'consenso rifiutato',
};

/** Serve a far riconoscere l'esito dall'elenco della posta, senza aprire. */
export function outcomeSubject(snapshot: SessionOutcomeSnapshot): string {
  const verdict = classifySessionOutcome(snapshot);
  const reason = snapshot.errorCode ? ` · ${snapshot.errorCode}` : '';
  return `[KaiPai] Seduta ${snapshot.sessionId} (prenotazione ${snapshot.bookingId}) · ${SUBJECT_LABEL[verdict]}${reason}`;
}

function minuti(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

function istante(value: Date | null): string {
  return value ? value.toISOString().replace('T', ' ').slice(0, 19) : '—';
}

function megabyte(bytes: number | null): string {
  return bytes === null ? '—' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Il corpo della mail, in testo semplice.
 *
 * Testo e non tabelle HTML: questa mail si legge dal telefono alle sette di
 * mattina per decidere se c'è da correre, e si incolla in una chat quando la
 * risposta è no. Un log incolonnato regge entrambe le cose.
 *
 * L'ordine non è casuale: prima il verdetto, poi la copertura — che è la
 * domanda «quanto ne abbiamo davvero preso» — e solo in fondo la traccia
 * completa, per chi sta indagando sul serio.
 */
export function buildOutcomeReport(snapshot: SessionOutcomeSnapshot): string {
  const verdict = classifySessionOutcome(snapshot);
  const lines: string[] = [];

  lines.push(`ESITO: ${VERDICT_LABEL[verdict]}`);
  if (snapshot.errorCode) lines.push(`MOTIVO: ${snapshot.errorCode}`);
  /*
   * Su una seduta rifiutata il resto del rapporto è fuorviante letto di
   * fretta: la copertura audio dice «0 min su 0 min (100%) ok», che sembra
   * un successo, e le registrazioni sono «nessuna», che sembra una perdita.
   * Nessuna delle due. Una riga lo dice prima che qualcuno le interpreti.
   */
  if (verdict === 'rifiutata') {
    lines.push(
      'NOTA: nessuna registrazione è mai partita. Esito previsto, non un guasto.'
    );
  }
  lines.push('');

  lines.push('SEDUTA');
  lines.push(`  sessione ................ ${snapshot.sessionId}`);
  lines.push(`  prenotazione ............ ${snapshot.bookingId}`);
  lines.push(`  coach ................... ${snapshot.coachName}`);
  lines.push(`  atleta (id) ............. ${snapshot.athleteUserId}`);
  lines.push(`  in calendario ........... ${istante(snapshot.scheduledFor)}`);
  lines.push(`  registrazione da ........ ${istante(snapshot.startedAt)}`);
  lines.push(`  registrazione a ......... ${istante(snapshot.endedAt)}`);
  lines.push(`  durata .................. ${minuti(snapshot.sessionSeconds)}`);
  lines.push(`  stato finale ............ ${snapshot.status}`);
  lines.push(
    `  riepilogo ............... ${snapshot.reportId ? `#${snapshot.reportId}` : 'nessuno'}`
  );
  lines.push(`  segmenti trascritti ..... ${snapshot.transcriptSegments}`);
  if (snapshot.reportId !== null) {
    const flag = snapshot.reportThemesCount === 0 ? ' <<< ZERO TEMI' : '';
    lines.push(
      `  temi nel riepilogo ...... ${snapshot.reportThemesCount ?? '—'}${flag}`
    );
  }
  lines.push('');

  lines.push('COPERTURA AUDIO');
  if (snapshot.coverage.length === 0) {
    lines.push('  nessuna registrazione');
  }
  for (const participant of snapshot.coverage) {
    const percent = Math.round(participant.ratio * 100);
    const flag = participant.complete ? 'ok' : '<<< INCOMPLETA';
    lines.push(
      `  ${participant.role.padEnd(8)} ${minuti(participant.recordedSeconds).padStart(7)} su ${minuti(snapshot.sessionSeconds)} (${percent}%) ${flag}`
    );
  }
  lines.push('');

  lines.push('REGISTRAZIONI');
  if (snapshot.recordings.length === 0) lines.push('  nessuna');
  for (const recording of snapshot.recordings) {
    lines.push(
      `  #${recording.id} ${recording.role}/seg${recording.segment} · ${recording.status} · ${megabyte(recording.sizeBytes)} · ${recording.durationSeconds ?? '—'}s`
    );
    if (recording.errorCode) {
      lines.push(`      errore: ${recording.errorCode}`);
    }
    /*
     * Il messaggio del provider per esteso.
     *
     * E' la riga che il 16 agosto non c'era, sostituita da un segnaposto: per
     * ritrovare «413 EntityTooLarge» e' servito interrogare a mano l'API
     * degli egress giorni dopo, a seduta gia' persa.
     */
    if (recording.errorMessage) {
      lines.push(`      dettaglio: ${recording.errorMessage}`);
    }
  }
  lines.push('');

  lines.push('LAVORAZIONE');
  if (snapshot.jobs.length === 0) lines.push('  nessun job');
  for (const job of snapshot.jobs) {
    lines.push(
      `  #${job.id} ${job.type} · ${job.status} · tentativi ${job.attempts}` +
        (job.errorCode ? ` · ${job.errorCode}` : '') +
        (job.errorMessage ? ` · ${job.errorMessage}` : '')
    );
  }
  lines.push('');

  lines.push('TRACCIA COMPLETA');
  if (snapshot.audit.length === 0) lines.push('  vuota');
  for (const row of snapshot.audit) {
    const transition =
      row.previousStatus || row.newStatus
        ? ` ${row.previousStatus ?? '—'} -> ${row.newStatus ?? '—'}`
        : '';
    lines.push(
      `  ${istante(row.at)} ${row.eventType}${transition} ${row.metadata}`
    );
  }

  return lines.join('\n');
}

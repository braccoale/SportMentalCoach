import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOutcomeReport,
  classifySessionOutcome,
  outcomeSubject,
  type SessionOutcomeSnapshot,
} from './session-outcome-report';

function snapshot(
  overrides: Partial<SessionOutcomeSnapshot> = {}
): SessionOutcomeSnapshot {
  return {
    sessionId: 72,
    bookingId: 202,
    athleteUserId: 93,
    coachName: 'Francesco',
    status: 'ready_for_review',
    errorCode: null,
    scheduledFor: new Date('2026-08-16T15:00:00Z'),
    startedAt: new Date('2026-08-16T15:02:15Z'),
    endedAt: new Date('2026-08-16T16:04:13Z'),
    processingCompletedAt: new Date('2026-08-16T16:09:31Z'),
    sessionSeconds: 3718,
    coverage: [
      { role: 'coach', recordedSeconds: 3719, ratio: 1, complete: true },
      { role: 'athlete', recordedSeconds: 3700, ratio: 0.99, complete: true },
    ],
    transcriptSegments: 592,
    reportId: 44,
    reportThemesCount: 2,
    recordings: [],
    jobs: [],
    audit: [],
    ...overrides,
  };
}

test('una seduta riuscita con copertura piena è ok', () => {
  assert.equal(classifySessionOutcome(snapshot()), 'ok');
});

/*
 * La seduta 181: riepilogo consegnato regolarmente, 48 minuti di voce del
 * coach mai registrati. Nessuno stato lo segnalava — `ready_for_review` come
 * tutte le altre — ed è rimasta «riuscita» per quattro giorni.
 */
test('un riepilogo consegnato sopra una voce persa è parziale, non ok', () => {
  const parziale = snapshot({
    coverage: [
      { role: 'coach', recordedSeconds: 427, ratio: 0.12, complete: false },
      { role: 'athlete', recordedSeconds: 3343, ratio: 1, complete: true },
    ],
  });
  assert.equal(classifySessionOutcome(parziale), 'parziale');
  assert.match(outcomeSubject(parziale), /PARZIALE/);
  assert.match(buildOutcomeReport(parziale), /INCOMPLETA/);
});

/*
 * La sessione 114: pipeline tutta verde, riepilogo approvato dal coach sopra
 * un report con zero temi — il tentativo di generazione, ricominciato da capo
 * dopo un primo rifiuto della validazione, questa volta ha omesso tutto ciò
 * che richiedeva un'evidenza invece di trovarne una. `MIN_THEMES` in
 * generazione dovrebbe impedirlo da qui in avanti; questo test copre il caso
 * in cui, per qualunque motivo, un report del genere arrivasse comunque.
 */
test('un riepilogo consegnato con zero temi è parziale, non ok', () => {
  const parziale = snapshot({ reportThemesCount: 0 });
  assert.equal(classifySessionOutcome(parziale), 'parziale');
  assert.match(outcomeSubject(parziale), /PARZIALE/);
  assert.match(buildOutcomeReport(parziale), /ZERO TEMI/);
});

test('nessun riepilogo ancora generato non conta come zero temi', () => {
  const senzaReport = snapshot({ reportId: null, reportThemesCount: null });
  assert.equal(classifySessionOutcome(senzaReport), 'ok');
});

test('gli stati terminali di guasto sono falliti, il rifiuto è cosa sua', () => {
  for (const status of ['report_failed', 'transcription_failed', 'cancelled']) {
    assert.equal(classifySessionOutcome(snapshot({ status })), 'fallita');
  }
  assert.equal(
    classifySessionOutcome(snapshot({ status: 'consent_rejected' })),
    'rifiutata'
  );
});

test('l’oggetto porta il motivo, così si legge senza aprire', () => {
  const fallita = snapshot({
    status: 'report_failed',
    errorCode: 'REPORT_NOT_GENERATED',
  });
  assert.equal(
    outcomeSubject(fallita),
    '[KaiPai] Seduta 72 (prenotazione 202) · FALLITA · REPORT_NOT_GENERATED'
  );
});

/*
 * La riga che il 16 agosto non c'era. Il messaggio di LiveKit veniva
 * sostituito da un segnaposto, e per ritrovare la causa è servito interrogare
 * a mano l'API degli egress giorni dopo.
 */
test('il messaggio vero del provider finisce nel rapporto', () => {
  const report = buildOutcomeReport(
    snapshot({
      status: 'report_failed',
      recordings: [
        {
          id: 89,
          role: 'athlete',
          segment: 0,
          status: 'failed',
          errorCode: 'EGRESS_FAILED',
          errorMessage: 'S3 upload failed: 413 EntityTooLarge',
          sizeBytes: null,
          durationSeconds: null,
        },
      ],
    })
  );
  assert.match(report, /EGRESS_FAILED/);
  assert.match(report, /413 EntityTooLarge/);
});

test('nel rapporto non entra il nome dell’atleta', () => {
  const report = buildOutcomeReport(snapshot());
  // Il coach sì: è un professionista sulla propria seduta.
  assert.match(report, /Francesco/);
  // L'atleta resta un identificativo, che basta a ritrovarlo in database.
  assert.match(report, /atleta \(id\) \.+ 93/);
});

/*
 * Il tono dell'oggetto, che non e` un dettaglio di stile.
 *
 * Un rifiuto e` un esito previsto: l'atleta ha detto no e il sistema non ha
 * registrato niente. Se anche quella mail grida come grida un guasto, il
 * coach impara che gridano tutte — e smette di aprirle proprio prima della
 * volta in cui una seduta si perde davvero.
 */
test('il rifiuto non grida nell’oggetto, il guasto sì', () => {
  const rifiutata = snapshot({ status: 'consent_rejected' });
  const oggetto = outcomeSubject(rifiutata);

  assert.match(oggetto, /consenso rifiutato/);
  assert.doesNotMatch(
    oggetto,
    /CONSENSO RIFIUTATO/,
    'le maiuscole restano dove c’è qualcosa da fare'
  );

  assert.match(
    outcomeSubject(snapshot({ status: 'report_failed' })),
    /FALLITA/,
    'un guasto deve continuare a farsi riconoscere dall’elenco della posta'
  );
});

test('su una seduta rifiutata il rapporto dice che non c’è niente di rotto', () => {
  const rapporto = buildOutcomeReport(snapshot({ status: 'consent_rejected' }));

  // Nel corpo il maiuscolo resta: li` e` la voce di un log, non un tono.
  assert.match(rapporto, /ESITO: CONSENSO RIFIUTATO/);
  assert.match(rapporto, /Esito previsto, non un guasto/);

  assert.doesNotMatch(
    buildOutcomeReport(snapshot({ status: 'report_failed' })),
    /Esito previsto/,
    'la nota vale solo per il rifiuto'
  );
});

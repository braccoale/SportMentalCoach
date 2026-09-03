import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCause } from './service-causes';

test('un errore del dispositivo dice che non si risolve sulla piattaforma', () => {
  const c = describeCause('videochiamate', 'media_device_error');
  assert.equal(c.label, 'Errore dispositivo');
  assert.match(c.hint, /sulla postazione, non sulla piattaforma/);
});

test('due «fallimenti» opposti non si descrivono allo stesso modo', () => {
  const silenzio = describeCause('trascrizione', 'NO_SPEECH_DETECTED');
  const riepilogo = describeCause('riepiloghi', 'REPORT_NOT_GENERATED');

  // Uno non è un guasto e non si recupera…
  assert.match(silenzio.hint, /Non è un guasto/);
  assert.match(silenzio.hint, /non si recupera/);
  // …l'altro è l'unico che si riprende.
  assert.match(riepilogo.hint, /si può riprendere/);
});

test('un codice sconosciuto non rompe niente e lo ammette', () => {
  const c = describeCause('trascrizione', 'CODICE_MAI_VISTO');
  assert.equal(c.label, 'CODICE_MAI_VISTO');
  assert.match(c.hint, /non ancora descritto/);
});

test('i vocabolari sono separati per servizio', () => {
  // `media_device_error` è un evento video: chiesto come codice AI non deve
  // restituire la descrizione video per caso.
  assert.equal(
    describeCause('trascrizione', 'media_device_error').label,
    'media_device_error'
  );
});

test('un modello di email sconosciuto resta leggibile', () => {
  const c = describeCause('email', 'appointment_reminder');
  assert.equal(c.label, 'appointment_reminder');
  assert.match(c.hint, /registro delle consegne/);
});

test('ogni codice descritto ha un suggerimento che dice qualcosa', () => {
  const codici = [
    ['videochiamate', 'media_device_error'],
    ['videochiamate', 'participant_connection_aborted'],
    ['videochiamate', 'krisp_error'],
    ['trascrizione', 'NO_AUDIO_RECORDED'],
    ['trascrizione', 'TRANSCRIPTION_INCOMPLETE'],
    ['riepiloghi', 'COMPASS_TIMEOUT'],
    ['riepiloghi', 'PROCESSING_FAILED'],
    ['registrazioni', 'EGRESS_FAILED'],
    ['registrazioni', 'SENZA_CODICE'],
  ] as const;

  for (const [servizio, code] of codici) {
    const c = describeCause(servizio, code);
    assert.notEqual(c.label, code, `${code} non ha un'etichetta leggibile`);
    assert.ok(c.hint.length > 40, `${code} ha un suggerimento troppo povero`);
  }
});

test('ogni codice che esiste davvero in produzione ha una descrizione', () => {
  /*
   * Non un elenco di ipotesi: sono i codici letti dal database di produzione
   * il 3 settembre 2026. `EGRESS_START_FAILED` era sfuggito, e in pagina
   * compariva come stringa maiuscola senza spiegazione — cioe' come un
   * errore del pannello, non come un errore della piattaforma.
   */
  const inProduzione: [string, string][] = [
    ['trascrizione', 'TRANSCRIPTION_INCOMPLETE'],
    ['riepiloghi', 'REPORT_NOT_GENERATED'],
    ['trascrizione', 'NO_SPEECH_DETECTED'],
    ['registrazioni', 'EGRESS_FAILED'],
    ['registrazioni', 'EGRESS_START_FAILED'],
    ['riepiloghi', 'COMPASS_TIMEOUT'],
    ['riepiloghi', 'PROCESSING_FAILED'],
    ['videochiamate', 'media_device_error'],
    ['videochiamate', 'participant_connection_aborted'],
  ];

  for (const [servizio, code] of inProduzione) {
    const descritta = describeCause(servizio, code);
    assert.notEqual(
      descritta.label,
      code,
      `${code} compare in produzione e non ha un'etichetta leggibile`
    );
  }
});

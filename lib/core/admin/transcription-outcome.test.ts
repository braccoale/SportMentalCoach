import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { transcriptionOutcome } from './transcription-outcome';

const kind = (aiTranscriptionStatus: string | null, transcriptSegments = 0) =>
  transcriptionOutcome({ aiTranscriptionStatus, transcriptSegments }).kind;

describe('transcriptionOutcome', () => {
  it('senza riga di appunti AI la trascrizione non è avviata', () => {
    assert.equal(kind(null), 'none');
  });

  it('è riuscita solo con segmenti presenti', () => {
    for (const status of ['ready_for_review', 'approved', 'shared']) {
      assert.equal(kind(status, 656), 'done');
      assert.equal(kind(status, 0), 'failed');
    }
  });

  it('report_failed con segmenti: la trascrizione c\'è, manca il riepilogo', () => {
    assert.equal(kind('report_failed', 12), 'summary_failed');
    assert.equal(kind('report_failed', 0), 'failed');
  });

  it('gli stati di fallimento sono fallimenti', () => {
    assert.equal(kind('transcription_failed'), 'failed');
    assert.equal(kind('cancelled'), 'failed');
  });

  it('gli stati intermedi non sono né riuscita né fallita', () => {
    assert.equal(kind('waiting_for_consent'), 'waiting');
    assert.equal(kind('active'), 'in_progress');
    assert.equal(kind('processing'), 'in_progress');
  });

  it('il consenso negato è un esito a sé, non un errore', () => {
    assert.equal(kind('consent_rejected'), 'refused');
  });
});

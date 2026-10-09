import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COACH_VIDEO_MAX_SECONDS } from './coach-video-upload';
import { VIDEO_GUIDE_STEPS, VIDEO_GUIDE_TOTAL_SECONDS, activeGuideStep } from './coach-video-guide';

describe('traccia del video di presentazione', () => {
  it('sono tre passaggi numerati da 1, per circa un minuto, dentro il tetto del video', () => {
    assert.deepEqual(VIDEO_GUIDE_STEPS.map((s) => s.n), [1, 2, 3]);
    assert.equal(VIDEO_GUIDE_TOTAL_SECONDS, 60);
    assert.ok(VIDEO_GUIDE_TOTAL_SECONDS <= COACH_VIDEO_MAX_SECONDS);
  });
  it('il passaggio in corso segue i secondi, e oltre la traccia resta l’ultimo', () => {
    assert.equal(activeGuideStep(0), 1);
    assert.equal(activeGuideStep(14.9), 1);
    assert.equal(activeGuideStep(15), 2);
    assert.equal(activeGuideStep(44), 2);
    assert.equal(activeGuideStep(45), 3);
    assert.equal(activeGuideStep(600), 3);
  });
  it('un valore strano non rompe nulla', () => {
    assert.equal(activeGuideStep(-3), 1);
    assert.equal(activeGuideStep(NaN), 1);
  });
});

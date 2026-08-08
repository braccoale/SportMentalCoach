import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTimeline,
  normalizeTranscriptText,
  timelineRowsFingerprint,
} from './timeline';
test('normalization only changes whitespace and safe punctuation', () => assert.equal(normalizeTranscriptText('  Ciao\r\n  “mondo” —  12  '), 'Ciao "mondo" - 12'));
test('timeline ordering, ties, gaps and overlaps are deterministic', () => { const r=buildTimeline([{id:3,participantRecordingId:2,participantUserId:2,participantRole:'athlete',participantSequence:0,startMs:100,endMs:200,text:' atleta ',provider:'deepgram',model:'nova-3'},{id:2,participantRecordingId:1,participantUserId:1,participantRole:'coach',participantSequence:0,startMs:100,endMs:250,text:'coach',provider:'deepgram',model:'nova-3'},{id:4,participantRecordingId:1,participantUserId:1,participantRole:'coach',participantSequence:1,startMs:6000,endMs:6000,text:'fine',provider:'deepgram',model:'nova-3'}]); assert.deepEqual(r.segments.map(s=>s.id),[3,2,4]); assert.equal(r.segments[1].flags.overlaps_previous,true); assert.equal(r.segments[2].flags.large_gap_before,true); assert.equal(r.segments[2].flags.duration_zero,true); });

test('lo stesso contenuto produce lo stesso fingerprint', () => {
  const rows = [
    { startMs: 0, endMs: 1000, participantRole: 'coach', normalizedText: 'Ciao' },
    { startMs: 1000, endMs: 2000, participantRole: 'athlete', normalizedText: 'Ciao' },
  ];
  assert.equal(
    timelineRowsFingerprint(rows),
    timelineRowsFingerprint(rows.slice().reverse())
  );
});

test('un segmento in piu cambia il fingerprint', () => {
  const base = [
    { startMs: 0, endMs: 1000, participantRole: 'coach', normalizedText: 'Ciao' },
  ];
  const esteso = [
    ...base,
    { startMs: 5000, endMs: 6000, participantRole: 'athlete', normalizedText: 'Eccomi' },
  ];
  // E' il caso della riconnessione: la trascrizione si estende, e il
  // riepilogo deve accorgersene invece di restare fermo alla prima meta'.
  assert.notEqual(timelineRowsFingerprint(base), timelineRowsFingerprint(esteso));
});

test('un testo diverso cambia il fingerprint', () => {
  assert.notEqual(
    timelineRowsFingerprint([
      { startMs: 0, endMs: 1, participantRole: 'coach', normalizedText: 'a' },
    ]),
    timelineRowsFingerprint([
      { startMs: 0, endMs: 1, participantRole: 'coach', normalizedText: 'b' },
    ])
  );
});

test('lo stesso testo attribuito a un altro parlante cambia il fingerprint', () => {
  assert.notEqual(
    timelineRowsFingerprint([
      { startMs: 0, endMs: 1, participantRole: 'coach', normalizedText: 'a' },
    ]),
    timelineRowsFingerprint([
      { startMs: 0, endMs: 1, participantRole: 'athlete', normalizedText: 'a' },
    ])
  );
});

test('una timeline vuota ha comunque un fingerprint stabile', () => {
  assert.equal(timelineRowsFingerprint([]), timelineRowsFingerprint([]));
});

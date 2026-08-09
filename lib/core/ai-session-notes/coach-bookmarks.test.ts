import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookmarkPositionMs,
  isDuplicateBookmark,
  BOOKMARK_LOOKBACK_MS,
  BOOKMARK_MERGE_WINDOW_MS,
} from './coach-bookmarks';

const start = new Date('2026-08-09T10:00:00.000Z');
const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

test('il segnalibro arretra rispetto a quando si e premuto', () => {
  assert.equal(BOOKMARK_LOOKBACK_MS, 15_000);
  // Premuto al minuto 5: quando il coach se ne accorge la frase e' gia'
  // stata detta, quindi si riparte da 4:45.
  assert.equal(
    bookmarkPositionMs({ pressedAt: at(300), sessionStartedAt: start }),
    285_000
  );
});

test('un segnalibro nei primi secondi non finisce prima dell inizio', () => {
  assert.equal(
    bookmarkPositionMs({ pressedAt: at(4), sessionStartedAt: start }),
    0
  );
});

test('senza un inizio di sessione il segnalibro non e collocabile', () => {
  assert.equal(
    bookmarkPositionMs({ pressedAt: at(60), sessionStartedAt: null }),
    null
  );
});

test('un orologio che va indietro non produce una posizione negativa', () => {
  assert.equal(
    bookmarkPositionMs({ pressedAt: at(-30), sessionStartedAt: start }),
    null
  );
});

test('premere due volte di seguito non crea due segnalibri', () => {
  assert.equal(BOOKMARK_MERGE_WINDOW_MS, 20_000);
  assert.equal(isDuplicateBookmark(300_000, [295_000]), true);
});

test('due momenti distinti restano distinti', () => {
  assert.equal(isDuplicateBookmark(300_000, [120_000, 600_000]), false);
});

test('il primo segnalibro non e mai un duplicato', () => {
  assert.equal(isDuplicateBookmark(300_000, []), false);
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COACH_VIDEO_MAX_BYTES,
  COACH_VIDEO_MAX_SECONDS,
  baseVideoType,
  buildVideoKey,
  extensionForVideoType,
  formatClock,
  isOwnVideoKey,
  pickRecorderMimeType,
  storageKeyFromPublicUrl,
  validateVideo,
} from './coach-video-upload';

describe('validateVideo', () => {
  const ok = { type: 'video/mp4', size: 5_000_000, durationSec: 60 };
  it('accetta un video valido, anche con i parametri nel tipo', () => {
    assert.deepEqual(validateVideo(ok), { ok: true });
    assert.deepEqual(validateVideo({ ...ok, type: 'video/webm;codecs=vp9,opus' }), { ok: true });
    assert.deepEqual(validateVideo({ ...ok, type: 'video/quicktime' }), { ok: true });
  });
  it('rifiuta formati non supportati, file vuoti e troppo pesanti, con un messaggio chiaro', () => {
    for (const bad of [
      { ...ok, type: 'video/x-msvideo' },
      { ...ok, type: 'image/png' },
      { ...ok, size: 0 },
      { ...ok, size: COACH_VIDEO_MAX_BYTES + 1 },
    ]) {
      const r = validateVideo(bad);
      assert.equal(r.ok, false);
      assert.ok(!r.ok && r.error.length > 10);
    }
  });
  it('la durata conta solo se nota, con un secondo di tolleranza', () => {
    assert.equal(validateVideo({ ...ok, durationSec: undefined }).ok, true);
    assert.equal(validateVideo({ ...ok, durationSec: null }).ok, true);
    assert.equal(validateVideo({ ...ok, durationSec: COACH_VIDEO_MAX_SECONDS + 1 }).ok, true);
    assert.equal(validateVideo({ ...ok, durationSec: COACH_VIDEO_MAX_SECONDS + 5 }).ok, false);
  });
});

describe('formato e percorso', () => {
  it('estensione dal tipo, con ripiego mp4', () => {
    assert.equal(extensionForVideoType('video/webm;codecs=vp8'), 'webm');
    assert.equal(extensionForVideoType('video/quicktime'), 'mov');
    assert.equal(extensionForVideoType('boh'), 'mp4');
    assert.equal(baseVideoType(' Video/MP4 ; codecs=x'), 'video/mp4');
  });
  it('il percorso nuovo è sempre del coach e sotto videos/', () => {
    const key = buildVideoKey(12, 1700000000000, 'video/webm');
    assert.equal(key, 'videos/intro-12-1700000000000.webm');
    assert.equal(isOwnVideoKey(12, key), true);
    assert.equal(isOwnVideoKey(13, key), false); // di un altro coach
    assert.equal(isOwnVideoKey(12, 'videos/intro-12-5.exe'), false);
    assert.equal(isOwnVideoKey(12, 'avatars/avatar-12-5.png'), false);
    assert.equal(isOwnVideoKey(1, 'videos/intro-12-5.mp4'), false); // 1 non è un prefisso di 12
    assert.equal(isOwnVideoKey(12, 'videos/../intro-12-5.mp4'), false);
  });
});

describe('storageKeyFromPublicUrl', () => {
  const base = 'https://abc.supabase.co';
  it('ricava il percorso dall’indirizzo pubblico del bucket', () => {
    assert.equal(
      storageKeyFromPublicUrl(`${base}/storage/v1/object/public/media/videos/intro-1-2.mp4`, base, 'media'),
      'videos/intro-1-2.mp4'
    );
    assert.equal(
      storageKeyFromPublicUrl(`${base}/storage/v1/object/public/media/videos/intro-1-2.mp4?t=9`, `${base}/`, 'media'),
      'videos/intro-1-2.mp4'
    );
  });
  it('un indirizzo di un altro bucket, di un altro sito o locale non è nostro', () => {
    assert.equal(storageKeyFromPublicUrl(`${base}/storage/v1/object/public/altro/videos/a.mp4`, base, 'media'), null);
    assert.equal(storageKeyFromPublicUrl('https://youtu.be/abc', base, 'media'), null);
    assert.equal(storageKeyFromPublicUrl('/uploads/videos/a.mp4', base, 'media'), null);
    assert.equal(storageKeyFromPublicUrl(`${base}/storage/v1/object/public/media/../x`, base, 'media'), null);
    assert.equal(storageKeyFromPublicUrl('non-un-url', 'non-un-url', 'media'), null);
  });
});

describe('pickRecorderMimeType e formatClock', () => {
  it('sceglie MP4 se c’è, poi WebM, altrimenti niente', () => {
    assert.equal(pickRecorderMimeType((t) => t === 'video/mp4'), 'video/mp4');
    assert.equal(pickRecorderMimeType((t) => t.startsWith('video/webm;codecs=vp8')), 'video/webm;codecs=vp8,opus');
    assert.equal(pickRecorderMimeType(() => false), null);
    assert.equal(pickRecorderMimeType(() => true), 'video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  });
  it('il cronometro', () => {
    assert.equal(formatClock(0), '0:00');
    assert.equal(formatClock(65.9), '1:05');
    assert.equal(formatClock(120), '2:00');
    assert.equal(formatClock(-3), '0:00');
  });
});

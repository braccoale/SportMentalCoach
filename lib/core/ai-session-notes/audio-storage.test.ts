import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAudioStorage } from './audio-storage';

test('lo storage in memoria produce una URL firmata per un oggetto esistente', async () => {
  const storage = new InMemoryAudioStorage();
  storage.put('audio-recordings/1/coach/a.ogg', Buffer.from('audio'));

  const url = await storage.createSignedUrl(
    'audio-recordings/1/coach/a.ogg',
    900
  );

  assert.match(url, /^https:\/\//);
  assert.ok(url.includes('audio-recordings/1/coach/a.ogg'));
});

test('una URL firmata per un oggetto assente fallisce', async () => {
  const storage = new InMemoryAudioStorage();

  await assert.rejects(
    () => storage.createSignedUrl('audio-recordings/1/coach/manca.ogg', 900),
    /AUDIO_OBJECT_NOT_FOUND/
  );
});

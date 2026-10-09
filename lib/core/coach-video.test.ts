import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coachVideoSource, toEmbed, uploadedVideoSrc } from './coach-video';

describe('coachVideoSource', () => {
  it('YouTube e Vimeo si incorporano (YouTube senza cookie)', () => {
    assert.deepEqual(coachVideoSource('https://youtu.be/abc123'), {
      kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/abc123', provider: 'YouTube',
    });
    assert.deepEqual(coachVideoSource('https://www.youtube.com/watch?v=xyz'), {
      kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/xyz', provider: 'YouTube',
    });
    assert.deepEqual(coachVideoSource('https://vimeo.com/12345'), {
      kind: 'embed', src: 'https://player.vimeo.com/video/12345', provider: 'Vimeo',
    });
  });
  it('un file caricato sulla piattaforma o un .mp4 si riproduce in pagina', () => {
    assert.deepEqual(coachVideoSource('/uploads/coach/video.mp4'), { kind: 'file', src: '/uploads/coach/video.mp4' });
    assert.deepEqual(coachVideoSource('https://cdn.esempio.it/v.webm?x=1'), { kind: 'file', src: 'https://cdn.esempio.it/v.webm?x=1' });
  });
  it('un altro indirizzo resta un link; vuoto o spazi, nessun video', () => {
    assert.deepEqual(coachVideoSource('https://esempio.it/pagina'), { kind: 'link', href: 'https://esempio.it/pagina' });
    assert.equal(coachVideoSource(null), null);
    assert.equal(coachVideoSource('   '), null);
  });
  it('un indirizzo non valido o senza id non si incorpora', () => {
    assert.equal(toEmbed('non è un url'), null);
    assert.equal(toEmbed('https://vimeo.com/chi-siamo'), null);
    assert.equal(uploadedVideoSrc('https://esempio.it/pagina'), null);
  });
});

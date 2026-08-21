import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReport,
  classifyArea,
  scanSourceText,
} from './i18n-inventory.mjs';

test('inventory classifies product surfaces deterministically', () => {
  assert.equal(classifyArea('app/(login)/login.tsx'), 'authentication');
  assert.equal(classifyArea('app/(dashboard)/dashboard/coach/page.tsx'), 'coach');
  assert.equal(classifyArea('lib/core/email/render.ts'), 'notifications-email');
  assert.equal(classifyArea('mobile/src/screens/Home.tsx'), 'mobile');
});

test('inventory finds visible copy while ignoring keys, classes and imports', () => {
  const candidates = scanSourceText(
    `
      import x from './module';
      const EMAIL_SUBJECT = 'Messaggio importante';
      export function Example() {
        setError('Riprova più tardi');
        return <button className="text-red-500" aria-label="Chiudi finestra">Salva ora</button>;
      }
    `,
    'components/example.tsx'
  );

  assert.deepEqual(
    candidates.map(({ kind, text }) => [kind, text]),
    [
      ['constant:EMAIL_SUBJECT', 'Messaggio importante'],
      ['state:setError', 'Riprova più tardi'],
      ['attribute:aria-label', 'Chiudi finestra'],
      ['jsx-text', 'Salva ora'],
    ]
  );
});

test('inventory report exposes a stable per-area baseline', () => {
  const report = buildReport([
    {
      area: 'shared',
      file: 'components/example.tsx',
      line: 2,
      kind: 'jsx-text',
      text: 'Salva',
    },
  ]);

  assert.match(report, /Current baseline:\*\* 1 candidates across 1 files/);
  assert.match(report, /\| shared \| 1 \| 1 \|/);
  assert.match(report, /L2: Salva/);
});

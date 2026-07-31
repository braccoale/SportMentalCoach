import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootLayoutPath = new URL('./layout.tsx', import.meta.url);
const manifestPath = new URL('./manifest.ts', import.meta.url);

test('the root document opts out of automatic translation', async () => {
  const source = await readFile(rootLayoutPath, 'utf8');

  assert.match(source, /<html\b[\s\S]*?\blang=["']it["']/);
  assert.match(source, /<html\b[\s\S]*?\btranslate=["']no["']/);
  assert.match(
    source,
    /other\s*:\s*\{[\s\S]*?\bgoogle\s*:\s*["']notranslate["']/
  );
  assert.match(
    source,
    /<body\b[^>]*\bclassName=["'][^"']*\bnotranslate\b[^"']*["']/
  );
  assert.doesNotMatch(source, /\blang=["']en["']/);
});

test('the PWA manifest declares Italian left-to-right content', async () => {
  const source = await readFile(manifestPath, 'utf8');

  assert.match(source, /\blang\s*:\s*["']it["']/);
  assert.match(source, /\bdir\s*:\s*["']ltr["']/);
});

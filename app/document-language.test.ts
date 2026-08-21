import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootLayoutPath = new URL('./layout.tsx', import.meta.url);
const manifestPath = new URL('./manifest.ts', import.meta.url);

test('the root document uses the configured locale and opts out of automatic translation', async () => {
  const source = await readFile(rootLayoutPath, 'utf8');

  assert.match(source, /getLocale\(\)/);
  assert.match(source, /<html\b[\s\S]*?\blang=\{locale\}/);
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

test('the root document provides the request catalogue to client components', async () => {
  const source = await readFile(rootLayoutPath, 'utf8');

  assert.match(source, /getMessages\(\)/);
  assert.match(source, /getClientMessages\(messages\)/);
  assert.match(
    source,
    /<NextIntlClientProvider\b[\s\S]*?\blocale=\{locale\}[\s\S]*?\bmessages=\{clientMessages\}/
  );
  assert.match(
    source,
    /<NextIntlClientProvider\b[\s\S]*?<GoogleAnalytics\b[\s\S]*?<\/NextIntlClientProvider>/
  );
});

test('the PWA manifest declares Italian left-to-right content', async () => {
  const source = await readFile(manifestPath, 'utf8');

  assert.match(source, /\blang\s*:\s*["']it["']/);
  assert.match(source, /\bdir\s*:\s*["']ltr["']/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL('./google-analytics.tsx', import.meta.url);

test('gtag queues commands in the format required by Google', async () => {
  const source = await readFile(componentPath, 'utf8');

  assert.match(source, /dataLayer!\.push\(arguments\)/);
  assert.doesNotMatch(source, /dataLayer!\.push\((?:command|_command)\)/);
});

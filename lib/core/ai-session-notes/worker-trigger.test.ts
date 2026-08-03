import assert from 'node:assert/strict';
import test from 'node:test';
import { triggerAiNotesWorker } from './worker-trigger';

type Call = { url: string; init: RequestInit };

function fakeFetch(
  calls: Call[],
  response: { ok: boolean } | { reject: unknown } = { ok: true }
) {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if ('reject' in response) throw response.reject;
    return { ok: response.ok } as Response;
  }) as typeof fetch;
}

function withEnvironment(
  values: Record<string, string | undefined>,
  run: () => Promise<void>
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return run().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('sveglia il worker in modalità asincrona con il segreto del cron', async () => {
  const calls: Call[] = [];
  await withEnvironment(
    { CRON_SECRET: 'segreto', BASE_URL: 'https://esempio.test' },
    async () => {
      assert.equal(await triggerAiNotesWorker(fakeFetch(calls)), 'triggered');
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://esempio.test/api/internal/ai-notes/process?mode=async'
  );
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].init.headers, { Authorization: 'Bearer segreto' });
});

test('non chiama nulla se manca il segreto: nessuna richiesta non autenticata', async () => {
  const calls: Call[] = [];
  await withEnvironment(
    { CRON_SECRET: undefined, BASE_URL: 'https://esempio.test' },
    async () => {
      assert.equal(await triggerAiNotesWorker(fakeFetch(calls)), 'skipped');
    }
  );
  assert.equal(calls.length, 0);
});

test('non chiama nulla se non sa a quale origine rivolgersi', async () => {
  const calls: Call[] = [];
  await withEnvironment(
    { CRON_SECRET: 'segreto', BASE_URL: undefined, NEXT_PUBLIC_APP_URL: undefined, VERCEL_URL: undefined },
    async () => {
      assert.equal(await triggerAiNotesWorker(fakeFetch(calls)), 'skipped');
    }
  );
  assert.equal(calls.length, 0);
});

test('su Vercel ricade sull’URL del deployment quando BASE_URL manca', async () => {
  const calls: Call[] = [];
  await withEnvironment(
    {
      CRON_SECRET: 'segreto',
      BASE_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_URL: 'deploy-abc.vercel.app',
    },
    async () => {
      assert.equal(await triggerAiNotesWorker(fakeFetch(calls)), 'triggered');
    }
  );
  assert.match(calls[0].url, /^https:\/\/deploy-abc\.vercel\.app\//);
});

test('un fallimento di rete non propaga eccezioni: il webhook non deve fallire', async () => {
  const calls: Call[] = [];
  await withEnvironment(
    { CRON_SECRET: 'segreto', BASE_URL: 'https://esempio.test' },
    async () => {
      assert.equal(
        await triggerAiNotesWorker(fakeFetch(calls, { reject: new Error('rete giù') })),
        'failed'
      );
    }
  );
  assert.equal(calls.length, 1);
});

test('una risposta non ok viene riportata come fallimento, senza eccezioni', async () => {
  const calls: Call[] = [];
  await withEnvironment(
    { CRON_SECRET: 'segreto', BASE_URL: 'https://esempio.test' },
    async () => {
      assert.equal(
        await triggerAiNotesWorker(fakeFetch(calls, { ok: false })),
        'failed'
      );
    }
  );
});

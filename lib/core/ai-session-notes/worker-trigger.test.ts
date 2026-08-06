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
  assert.equal(calls[0].init.redirect, 'manual');
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

test('su Vercel preferisce l’alias diretto del progetto anche se BASE_URL è configurata', async () => {
  // L'URL specifico di un deployment è dietro la protezione di Vercel:
  // chiamarlo restituisce un 302 verso la pagina di accesso e il worker non
  // viene mai svegliato. Il dominio stabile di produzione non è protetto.
  const calls: Call[] = [];
  await withEnvironment(
    {
      CRON_SECRET: 'segreto',
      BASE_URL: 'https://kaipaicoaching.com',
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: 'kaipai.example',
      VERCEL_URL: 'deploy-abc.vercel.app',
    },
    async () => {
      assert.equal(await triggerAiNotesWorker(fakeFetch(calls)), 'triggered');
    }
  );
  assert.match(calls[0].url, /^https:\/\/kaipai\.example\//);
  assert.equal(calls.length, 1);
});

test('senza dominio di produzione resta l’URL del deployment', async () => {
  const calls: Call[] = [];
  await withEnvironment(
    {
      CRON_SECRET: 'segreto',
      BASE_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
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

test('se l’alias diretto fallisce prova la BASE_URL senza seguire redirect', async () => {
  const calls: Call[] = [];
  let attempt = 0;
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    attempt += 1;
    return { ok: attempt === 2 } as Response;
  }) as typeof fetch;

  await withEnvironment(
    {
      CRON_SECRET: 'segreto',
      VERCEL_PROJECT_PRODUCTION_URL: 'sport-mental-coach-arge.vercel.app',
      BASE_URL: 'https://www.kaipaicoaching.com',
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_URL: undefined,
    },
    async () => {
      assert.equal(await triggerAiNotesWorker(fetcher), 'triggered');
    }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^https:\/\/sport-mental-coach-arge\.vercel\.app\//);
  assert.match(calls[1].url, /^https:\/\/www\.kaipaicoaching\.com\//);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[1].init.redirect, 'manual');
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

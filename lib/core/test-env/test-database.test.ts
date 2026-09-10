import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertTestDatabaseUrl,
  describeDatabaseUrl,
  isTestDatabaseMarker,
  markerRejectionMessage,
  TestDatabaseError,
} from './test-database';

const LOCAL = 'postgres://postgres:pw@localhost:55432/kaipai_test';
const PRODUCTION = 'postgres://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof TestDatabaseError);
    return error.code;
  }
  return 'NO_ERROR';
}

test('accetta un database locale che si chiama di prova', () => {
  assert.equal(assertTestDatabaseUrl({ TEST_DATABASE_URL: LOCAL }), LOCAL);
});

test('rifiuta quando la variabile manca o è vuota', () => {
  assert.equal(code(() => assertTestDatabaseUrl({})), 'MISSING');
  assert.equal(code(() => assertTestDatabaseUrl({ TEST_DATABASE_URL: '   ' })), 'MISSING');
});

test('rifiuta l’URL della produzione anche sotto il nome giusto', () => {
  assert.equal(
    code(() =>
      assertTestDatabaseUrl({
        TEST_DATABASE_URL: PRODUCTION,
        POSTGRES_URL: PRODUCTION,
      })
    ),
    'MATCHES_PRODUCTION'
  );
});

test('una barra finale non basta a farli sembrare due database', () => {
  assert.equal(
    code(() =>
      assertTestDatabaseUrl({
        TEST_DATABASE_URL: `${PRODUCTION}/`,
        POSTGRES_URL: PRODUCTION,
      })
    ),
    'MATCHES_PRODUCTION'
  );
});

test('rifiuta un servizio gestito anche quando POSTGRES_URL non è nota', () => {
  // È il caso pericoloso: senza `POSTGRES_URL` il confronto con la produzione
  // non scatta, e resterebbe solo il nome del database a difendere.
  assert.equal(
    code(() =>
      assertTestDatabaseUrl({
        TEST_DATABASE_URL:
          'postgres://u:p@db.abcdefgh.supabase.co:5432/kaipai_test',
      })
    ),
    'MANAGED_HOST'
  );
});

test('rifiuta un nome di database non riconoscibile', () => {
  assert.equal(
    code(() =>
      assertTestDatabaseUrl({
        TEST_DATABASE_URL: 'postgres://postgres:pw@localhost:55432/kaipai',
      })
    ),
    'NOT_RECOGNIZABLE'
  );
});

test('la scappatoia sul nome non apre le altre due porte', () => {
  assert.equal(
    assertTestDatabaseUrl({
      TEST_DATABASE_URL: 'postgres://postgres:pw@localhost:55432/ci_db_7714',
      ALLOW_NONSTANDARD_TEST_DATABASE: 'true',
    }),
    'postgres://postgres:pw@localhost:55432/ci_db_7714'
  );
  assert.equal(
    code(() =>
      assertTestDatabaseUrl({
        TEST_DATABASE_URL: PRODUCTION,
        POSTGRES_URL: PRODUCTION,
        ALLOW_NONSTANDARD_TEST_DATABASE: 'true',
      })
    ),
    'MATCHES_PRODUCTION'
  );
  assert.equal(
    code(() =>
      assertTestDatabaseUrl({
        TEST_DATABASE_URL: 'postgres://u:p@db.x.supabase.co:5432/anything',
        ALLOW_NONSTANDARD_TEST_DATABASE: 'true',
      })
    ),
    'MANAGED_HOST'
  );
});

test('rifiuta protocolli e URL che non sono PostgreSQL', () => {
  assert.equal(
    code(() => assertTestDatabaseUrl({ TEST_DATABASE_URL: 'non-un-url' })),
    'MALFORMED'
  );
  assert.equal(
    code(() =>
      assertTestDatabaseUrl({ TEST_DATABASE_URL: 'https://localhost/kaipai_test' })
    ),
    'MALFORMED'
  );
  assert.equal(
    code(() =>
      assertTestDatabaseUrl({ TEST_DATABASE_URL: 'postgres://localhost:5432' })
    ),
    'MALFORMED'
  );
});

test('il marcatore vale solo se il database lo dichiara davvero', () => {
  assert.equal(isTestDatabaseMarker('test'), true);
  assert.equal(isTestDatabaseMarker(' test '), true);
  // Il silenzio è la risposta della produzione, e non vale come consenso.
  assert.equal(isTestDatabaseMarker(null), false);
  assert.equal(isTestDatabaseMarker(undefined), false);
  assert.equal(isTestDatabaseMarker(''), false);
  assert.equal(isTestDatabaseMarker('production'), false);
});

test('il messaggio di rifiuto distingue «assente» da «sbagliato»', () => {
  assert.match(markerRejectionMessage(null), /vale niente/);
  assert.match(markerRejectionMessage('production'), /«production»/);
});

test('la descrizione di un URL non contiene la password', () => {
  const described = describeDatabaseUrl(LOCAL);
  assert.equal(described, 'localhost:55432/kaipai_test');
  assert.ok(!described.includes('pw'));
  assert.equal(describeDatabaseUrl('non-un-url'), '(url non analizzabile)');
});

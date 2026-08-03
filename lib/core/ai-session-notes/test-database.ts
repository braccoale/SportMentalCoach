import 'server-only';
export function requireTestDatabaseUrl(environment: Record<string, string | undefined> = process.env): string {
  const testUrl = environment.TEST_DATABASE_URL?.trim(); const productionUrl = environment.POSTGRES_URL?.trim();
  if (!testUrl) throw new Error('TEST_DATABASE_URL_REQUIRED');
  if (productionUrl && testUrl === productionUrl) throw new Error('TEST_DATABASE_URL_MATCHES_PRODUCTION');
  const database = new URL(testUrl).pathname.toLowerCase();
  if (!database.includes('test') && environment.AI_NOTES_ALLOW_NONSTANDARD_TEST_DATABASE !== 'true') throw new Error('TEST_DATABASE_URL_NOT_RECOGNIZABLE');
  return testUrl;
}

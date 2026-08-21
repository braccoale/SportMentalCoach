import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import italianMessages from '@/messages/it.json';

const nextConfigPath = new URL('../../next.config.ts', import.meta.url);
const requestConfigPath = new URL('./request.ts', import.meta.url);

test('the initial next-intl catalogue contains the migrated foundation namespaces', () => {
  assert.equal(
    italianMessages.Metadata.title,
    'KaiPai — Coaching mentale per atleti e squadre'
  );
  assert.equal(italianMessages.MarketplaceAuth.signIn, 'Accedi');
  assert.equal(italianMessages.NotFound.backHome, 'Torna alla home');
});

test('next-intl is configured without locale routing and with persisted resolution', async () => {
  const [nextConfig, requestConfig] = await Promise.all([
    readFile(nextConfigPath, 'utf8'),
    readFile(requestConfigPath, 'utf8'),
  ]);

  assert.match(nextConfig, /createNextIntlPlugin/);
  assert.match(nextConfig, /\.\/lib\/i18n\/request\.ts/);
  assert.doesNotMatch(nextConfig, /createMiddleware/);

  assert.match(requestConfig, /getRequestConfig/);
  assert.match(requestConfig, /loadMessageCatalog/);
  assert.match(requestConfig, /ENABLED_LOCALES\.length\s*===\s*1/);
  assert.match(requestConfig, /Promise\.all\(\[cookies\(\), headers\(\)\]\)/);
  assert.match(requestConfig, /getProfileLocale/);
  assert.match(requestConfig, /LOCALE_COOKIE_NAME/);
  assert.match(requestConfig, /accept-language/);
  assert.match(requestConfig, /resolveLocale/);
});

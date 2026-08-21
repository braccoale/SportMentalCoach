import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configuredCatalogLocales,
  enabledLocaleCodes,
  loadMessageCatalog,
  type MessageCatalog,
} from './catalogs';
import {
  CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
} from './client-messages';
import { DEFAULT_LOCALE, ENABLED_LOCALES } from './locales';

function flattenMessages(
  value: Record<string, unknown>,
  prefix = ''
): Map<string, string> {
  const flattened = new Map<string, string>();

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      flattened.set(path, child);
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      for (const [nestedPath, message] of flattenMessages(
        child as Record<string, unknown>,
        path
      )) {
        flattened.set(nestedPath, message);
      }
    } else {
      assert.fail(`Invalid message value at ${path}`);
    }
  }

  return flattened;
}

test('every enabled locale has one explicit catalogue loader', () => {
  assert.deepEqual(configuredCatalogLocales(), enabledLocaleCodes());
});

test('enabled catalogues have the same non-empty message keys as Italian', async () => {
  const reference = flattenMessages(
    (await loadMessageCatalog(DEFAULT_LOCALE)) as Record<string, unknown>
  );

  for (const locale of ENABLED_LOCALES) {
    const catalogue = flattenMessages(
      (await loadMessageCatalog(locale)) as Record<string, unknown>
    );
    assert.deepEqual([...catalogue.keys()], [...reference.keys()]);
    for (const [key, message] of catalogue) {
      assert.ok(message.trim(), `${locale}:${key} must not be empty`);
    }
  }
});

test('the client provider serializes only declared client namespaces', async () => {
  const messages = await loadMessageCatalog(DEFAULT_LOCALE);
  const clientMessages = getClientMessages(messages as MessageCatalog);

  assert.deepEqual(Object.keys(clientMessages), CLIENT_MESSAGE_NAMESPACES);
  assert.ok(Object.keys(clientMessages).length < Object.keys(messages).length);
  assert.equal('Metadata' in clientMessages, false);
  assert.equal('Footer' in clientMessages, false);
});

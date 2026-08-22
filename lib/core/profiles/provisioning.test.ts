import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbOrTx } from '@/lib/db/drizzle';
import { providerProfiles, services } from '@/lib/db/schema';
import { ensureProviderProfile } from './index';

function fakeExecutor(createdProviderId: number | null) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];

  const exec = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        if (table === providerProfiles) {
          return {
            onConflictDoNothing: () => ({
              returning: async () =>
                createdProviderId === null ? [] : [{ id: createdProviderId }],
            }),
          };
        }
        return Promise.resolve();
      },
    }),
  } as unknown as DbOrTx;

  return { exec, inserts };
}

test('il servizio predefinito nasce soltanto quando nasce il profilo coach', async () => {
  const created = fakeExecutor(91);
  await ensureProviderProfile(42, 'Giulia Rossi', created.exec);

  assert.equal(created.inserts.length, 2);
  assert.equal(created.inserts[0]?.table, providerProfiles);
  assert.equal(created.inserts[1]?.table, services);
  assert.deepEqual(created.inserts[1]?.values, {
    providerId: 91,
    title: 'Sessione online',
    description: 'Sport Mental Coach',
    durationMin: 40,
    price: 0,
    currency: 'EUR',
    isActive: true,
    createdBy: 42,
  });

  const existing = fakeExecutor(null);
  await ensureProviderProfile(42, 'Giulia Rossi', existing.exec);
  assert.equal(existing.inserts.length, 1);
});

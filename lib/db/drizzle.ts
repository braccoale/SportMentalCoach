import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

// Cache the postgres client on globalThis so Next.js hot-reloads reuse a single
// pool instead of leaking a new one on every edit (which exhausts the DB's
// connection slots). Keep the pool small in dev.
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

export const client =
  globalForDb.__pgClient ??
  postgres(process.env.POSTGRES_URL, {
    max: process.env.NODE_ENV === 'production' ? 10 : 1,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__pgClient = client;
}

export const db = drizzle(client, { schema });

// A query executor that is either the root db or an open transaction. Domain
// helpers accept this so they can participate in a caller's transaction.
export type Database = typeof db;
export type Transaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];
export type DbOrTx = Database | Transaction;

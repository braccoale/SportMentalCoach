import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

export const client = postgres(process.env.POSTGRES_URL);
export const db = drizzle(client, { schema });

// A query executor that is either the root db or an open transaction. Domain
// helpers accept this so they can participate in a caller's transaction.
export type Database = typeof db;
export type Transaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];
export type DbOrTx = Database | Transaction;

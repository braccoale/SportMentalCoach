import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { bookingEndsAfter } from './conflict-query';

test('encodes the proposed booking start as a PostgreSQL timestamp', () => {
  const proposedStart = new Date('2026-07-29T08:30:00.000Z');
  const query = new PgDialect().sqlToQuery(bookingEndsAfter(proposedStart));
  const timestampParameter = query.params.at(-1);

  assert.equal(typeof timestampParameter, 'string');
  assert.equal(timestampParameter, proposedStart.toISOString());
  assert.equal(
    query.params.some((parameter) => parameter instanceof Date),
    false
  );
});

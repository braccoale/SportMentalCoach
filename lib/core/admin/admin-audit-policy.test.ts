import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_DETAIL_MAX_KEYS,
  AUDIT_VALUE_MAX_LENGTH,
  buildAdminAuditEntry,
  sanitizeAuditDetail,
} from './admin-audit-policy';

test('identificativi, conteggi ed esiti passano intatti', () => {
  assert.deepEqual(
    sanitizeAuditDetail({ sessionId: 72, segmenti: 592, riaperta: true, motivo: null }),
    { sessionId: 72, segmenti: 592, riaperta: true, motivo: null }
  );
});

test('un segreto non entra nel registro, comunque si chiami', () => {
  const pulito = sanitizeAuditDetail({
    sessionId: 72,
    callbackToken: 'abc123',
    API_KEY: 'sk-live',
    signedUrl: 'https://…',
    authorization: 'Bearer …',
    cookieJar: 'sb-auth',
  });
  assert.deepEqual(pulito, { sessionId: 72 });
});

test('il contenuto di una seduta non entra nel registro', () => {
  const pulito = sanitizeAuditDetail({
    bookingId: 5,
    transcriptExcerpt: 'ho avuto paura di sbagliare',
    riepilogo: '…',
    coachNote: '…',
    testo: '…',
  });
  assert.deepEqual(pulito, { bookingId: 5 });
});

test('un valore troppo lungo per essere un codice viene troncato', () => {
  const lungo = 'x'.repeat(500);
  const pulito = sanitizeAuditDetail({ errore: lungo });
  assert.equal((pulito.errore as string).length, AUDIT_VALUE_MAX_LENGTH);
});

test('strutture annidate non entrano: un registro con dentro un oggetto non si interroga', () => {
  const pulito = sanitizeAuditDetail({
    ok: 1,
    nested: { a: 1 },
    lista: [1, 2, 3],
  });
  assert.deepEqual(pulito, { ok: 1 });
});

test('il dettaglio ha un tetto di chiavi', () => {
  const grande: Record<string, unknown> = {};
  for (let i = 0; i < 100; i += 1) grande[`k${i}`] = i;
  assert.equal(
    Object.keys(sanitizeAuditDetail(grande)).length,
    AUDIT_DETAIL_MAX_KEYS
  );
});

test('un numero non finito diventa null, non NaN nel JSON', () => {
  assert.deepEqual(sanitizeAuditDetail({ media: Number.NaN }), { media: null });
});

test('la voce di registro nasce completa, con esito predefinito «ok»', () => {
  const entry = buildAdminAuditEntry({
    action: 'coach_approved',
    subjectType: 'provider_profile',
    subjectId: 42,
  });
  assert.deepEqual(entry, {
    action: 'coach_approved',
    subjectType: 'provider_profile',
    subjectId: 42,
    outcome: 'ok',
    detail: {},
  });
});

test('un soggetto non intero diventa nullo invece di finire nel database storto', () => {
  const entry = buildAdminAuditEntry({
    action: 'data_exported',
    subjectType: 'system',
    subjectId: Number.NaN,
  });
  assert.equal(entry.subjectId, null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEmailIdempotencyKey,
  scopeForBooking,
  scopeForInvitation,
} from './idempotency';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  getConfigurableEventsByCategory,
  isMandatoryEmail,
} from './catalog';

test('due notifiche in-app diverse producono due chiavi diverse', () => {
  // Il caso che una dedup "una email al giorno" romperebbe: due messaggi in
  // chat allo stesso destinatario devono generare due email.
  const first = buildEmailIdempotencyKey({
    eventKey: 'new_message',
    recipientUserId: 7,
    notificationId: 101,
  });
  const second = buildEmailIdempotencyKey({
    eventKey: 'new_message',
    recipientUserId: 7,
    notificationId: 102,
  });
  assert.notEqual(first, second);
});

test('lo stesso evento rigenera la stessa chiave', () => {
  const input = {
    eventKey: 'booking_accepted',
    recipientUserId: 3,
    notificationId: 55,
  } as const;
  assert.equal(
    buildEmailIdempotencyKey(input),
    buildEmailIdempotencyKey(input)
  );
});

test('destinatari diversi non condividono la chiave', () => {
  assert.notEqual(
    buildEmailIdempotencyKey({
      eventKey: 'booking_cancelled',
      recipientUserId: 1,
      notificationId: 9,
    }),
    buildEmailIdempotencyKey({
      eventKey: 'booking_cancelled',
      recipientUserId: 2,
      notificationId: 9,
    })
  );
});

test('l’id della notifica in-app ha la precedenza sullo scope esplicito', () => {
  const key = buildEmailIdempotencyKey({
    eventKey: 'booking_reminder_1h',
    recipientUserId: 4,
    notificationId: 77,
    scope: scopeForBooking(12),
  });
  assert.ok(key.endsWith(':n77'));
});

test('i due promemoria dello stesso appuntamento restano distinti', () => {
  const base = { recipientUserId: 4, scope: scopeForBooking(12) };
  assert.notEqual(
    buildEmailIdempotencyKey({ ...base, eventKey: 'booking_reminder_24h' }),
    buildEmailIdempotencyKey({ ...base, eventKey: 'booking_reminder_1h' })
  );
});

test('un destinatario senza account è identificato dall’email normalizzata', () => {
  assert.equal(
    buildEmailIdempotencyKey({
      eventKey: 'coach_invitation',
      recipientUserId: null,
      recipientEmail: '  Mario.Rossi@Example.COM ',
      scope: scopeForInvitation(5),
    }),
    'v1:coach_invitation:email:emario.rossi@example.com:inv5'
  );
});

test('senza notifica e senza scope non inventa una chiave', () => {
  assert.throws(() =>
    buildEmailIdempotencyKey({
      eventKey: 'new_message',
      recipientUserId: 1,
    })
  );
});

test('il catalogo espone ogni evento in una sola categoria', () => {
  const grouped = getConfigurableEventsByCategory().flatMap((g) => g.events);
  assert.equal(grouped.length, NOTIFICATION_EVENT_KEYS.length);
});

test('gli eventi obbligatori dichiarano il motivo mostrato all’utente', () => {
  for (const key of NOTIFICATION_EVENT_KEYS) {
    const event = NOTIFICATION_EVENTS[key];
    if (event.mandatoryEmail) {
      assert.ok(event.mandatoryReason, `${key} senza mandatoryReason`);
      assert.ok(isMandatoryEmail(key));
    }
  }
});

test('la sicurezza non è disattivabile', () => {
  assert.equal(isMandatoryEmail('security_alert'), true);
  assert.equal(isMandatoryEmail('new_message'), false);
});

// --- Due canali indipendenti ------------------------------------------------

test('ogni evento con notifica in-app è configurabile su entrambi i canali', () => {
  for (const key of NOTIFICATION_EVENT_KEYS) {
    const event = NOTIFICATION_EVENTS[key];
    if (event.mandatoryEmail) continue;
    // L'evento senza gemello in-app espone solo l'email: non c'è nulla da
    // attivare nell'app per chi non ha ancora un account.
    if (!event.hasInApp) {
      assert.equal(key, 'coach_invitation');
      continue;
    }
    assert.equal(typeof event.inAppDefault, 'boolean', `${key}: inAppDefault`);
    assert.equal(typeof event.emailDefault, 'boolean', `${key}: emailDefault`);
  }
});

/**
 * Eventi per cui i due canali partono deliberatamente diversi.
 *
 * `call_started` annuncia una videochiamata già in corso: la notifica sul
 * dispositivo arriva in tempo per rispondere, l'email quasi certamente no.
 * Accenderla di default significherebbe mandare "entra nella chiamata" a
 * chiamata finita. Resta comunque attivabile dalle preferenze — è un default
 * diverso, non un canale sottratto.
 */
const CHANNEL_DEFAULTS_DIFFER_ON_PURPOSE = ['call_started'];

test('i due canali sono indipendenti: nessun default li lega', () => {
  // Nessun evento deve avere l'in-app subordinata all'email o viceversa:
  // l'utente può tenerne uno, l'altro, entrambi o nessuno. Dove i default
  // divergono deve essere una scelta dichiarata, non una svista.
  const linked = NOTIFICATION_EVENT_KEYS.filter((key) => {
    const e = NOTIFICATION_EVENTS[key];
    return (
      e.hasInApp &&
      e.inAppDefault !== e.emailDefault &&
      !CHANNEL_DEFAULTS_DIFFER_ON_PURPOSE.includes(key)
    );
  });
  assert.deepEqual(linked, []);
});

test('anche gli eventi con default diversi restano attivabili su entrambi i canali', () => {
  for (const key of CHANNEL_DEFAULTS_DIFFER_ON_PURPOSE) {
    const e = NOTIFICATION_EVENTS[key as keyof typeof NOTIFICATION_EVENTS];
    assert.equal(e.hasInApp, true, `${key}: deve avere il canale in-app`);
    assert.equal(
      e.mandatoryEmail,
      false,
      `${key}: l'email deve restare disattivabile`
    );
  }
});

test('solo coach_invitation non ha una notifica in-app', () => {
  const emailOnly = NOTIFICATION_EVENT_KEYS.filter(
    (k) => !NOTIFICATION_EVENTS[k].hasInApp
  );
  assert.deepEqual(emailOnly, ['coach_invitation']);
});

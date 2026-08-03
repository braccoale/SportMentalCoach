import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { SignJWT } from 'jose';
import { WebhookReceiver } from 'livekit-server-sdk';

const apiKey = 'test_api_key';
const apiSecret = 'synthetic-test-secret-at-least-32-bytes';
const encoder = new TextEncoder();

async function webhookToken(body: string, secret = apiSecret) {
  const sha256 = createHash('sha256').update(body).digest('base64');
  return new SignJWT({ sha256 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(apiKey)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(encoder.encode(secret));
}

test('LiveKit webhook receiver accepts a matching signed synthetic event', async () => {
  const body = JSON.stringify({
    event: 'room_finished',
    id: 'EV_synthetic_valid',
    createdAt: Math.floor(Date.now() / 1_000),
    room: { name: 'booking-123', sid: 'RM_synthetic' },
  });
  const event = await new WebhookReceiver(apiKey, apiSecret).receive(
    body,
    await webhookToken(body)
  );
  assert.equal(event.id, 'EV_synthetic_valid');
  assert.equal(event.event, 'room_finished');
});

test('LiveKit webhook receiver rejects wrong signature and altered body', async () => {
  const body = JSON.stringify({
    event: 'room_finished',
    id: 'EV_synthetic_invalid',
    createdAt: Math.floor(Date.now() / 1_000),
  });
  const receiver = new WebhookReceiver(apiKey, apiSecret);
  const wrongToken = await webhookToken(
    body,
    'wrong-secret-that-is-also-long-enough'
  );
  await assert.rejects(
    () => receiver.receive(body, wrongToken)
  );
  const token = await webhookToken(body);
  await assert.rejects(() =>
    receiver.receive(body.replace('room_finished', 'room_started'), token)
  );
});
